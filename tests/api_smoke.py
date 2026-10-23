"""Functional tests against a running development backend and SQL Server.

Run: KLINIK_API_URL=http://127.0.0.1:5043 python3 tests/api_smoke.py
Only records created by this run are removed during cleanup.
"""
import concurrent.futures
import datetime as dt
import json
import os
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get('KLINIK_API_URL', 'http://127.0.0.1:5043').rstrip('/')


def request(path, method='GET', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        content = response.headers.get('Content-Type', '')
        return response.code, json.loads(body) if body and 'json' in content else body.decode()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.suffix = uuid.uuid4().hex[:12]

    def create(self, path, payload):
        status, body = request(path, 'POST', payload)
        self.assertEqual(status, 201, body)
        self.addCleanup(self.remove, path + '/' + str(body['id']))
        return body['id']

    def remove(self, path):
        status, body = request(path, 'DELETE')
        self.assertIn(status, (204, 404), (path, body))

    def doctor(self):
        specialty = self.create('/api/specialties', {'name': 'Test ' + self.suffix})
        location = self.create('/api/locations', {'name': 'Test ' + self.suffix})
        doctor = self.create('/api/doctors', {
            'fullName': 'Test ' + self.suffix, 'isAvailable': True,
            'specialtyId': specialty, 'locationId': location})
        return doctor, specialty, location

    def booking(self, doctor):
        return {'patientName': 'Test Patient', 'phone': '+39 000 000000',
                'doctorId': doctor, 'status': 'In attesa',
                'appointmentDate': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7))
                .replace(microsecond=0).isoformat()}

    def test_reference_data_and_routes(self):
        for path in ['/api/specialties', '/api/locations', '/api/doctors',
                     '/api/products', '/api/medical-services', '/api/doctor-schedules']:
            with self.subTest(path=path):
                status, body = request(path)
                self.assertEqual(status, 200, body)
                self.assertGreater(len(body), 0)
        self.assertEqual(request('/api/missing')[0], 404)
        self.assertEqual(request('/')[0], 200)

    def test_input_validation(self):
        cases = [('/api/specialties', {'name': None}),
                 ('/api/specialties', {'name': 'x' * 101}),
                 ('/api/specialties', {'name': '  '}),
                 ('/api/products', {'name': 'Test', 'category': None}),
                 ('/api/products', {'name': 'Test', 'category': 'Test', 'price': 100000000}),
                 ('/api/products', {'name': 'Test', 'category': 'Test', 'stockQuantity': -1}),
                 ('/api/appointments', {'patientName': 'Test', 'phone': '1', 'doctorId': 1,
                                        'appointmentDate': '2035-01-01T10:00:00Z', 'email': 'invalid'}),
                 ('/api/doctor-schedules', {'doctorId': 1, 'dayOfWeek': 7,
                     'startTime': '09:00:00', 'endTime': '10:00:00', 'slotDurationMinutes': 30})]
        for path, payload in cases:
            with self.subTest(path=path, payload=payload):
                status, body = request(path, 'POST', payload)
                self.assertEqual(status, 400, body)
                self.assertIn('errors', body)

    def test_doctor_filters_and_relational_conflicts(self):
        doctor, specialty, location = self.doctor()
        status, body = request(f'/api/doctors?specialtyId={specialty}&locationId={location}&onlyAvailable=true')
        self.assertEqual(status, 200)
        self.assertEqual([row['id'] for row in body], [doctor])
        self.assertEqual(request(f'/api/specialties/{specialty}', 'DELETE')[0], 409)
        self.assertEqual(request('/api/specialties', 'POST', {'name': 'Test ' + self.suffix})[0], 409)

    def test_booking_cancel_and_rebook(self):
        doctor, _, _ = self.doctor()
        payload = self.booking(doctor)
        first = self.create('/api/appointments', payload)
        self.assertEqual(request('/api/appointments', 'POST', payload)[0], 409)
        self.assertEqual(request(f'/api/appointments/{first}/cancel', 'POST')[0], 204)
        second = self.create('/api/appointments', payload)
        self.assertNotEqual(first, second)
        without_status = {key: value for key, value in payload.items() if key != 'status'}
        self.assertEqual(request(f'/api/appointments/{first}', 'PUT', without_status)[0], 204)
        self.assertEqual(request(f'/api/appointments/{first}', 'PUT', {**payload, 'status': ''})[0], 204)
        self.assertEqual(request(f'/api/appointments/{first}/status', 'PUT', {'status': 'Confermata'})[0], 409)
        self.assertEqual(request(f'/api/appointments/{first}')[1]['status'], 'Annullata')

    def test_concurrent_booking_has_exactly_one_winner(self):
        doctor, _, _ = self.doctor()
        payload = self.booking(doctor)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: request('/api/appointments', 'POST', payload), range(4)))
        for status, body in results:
            if status == 201:
                self.addCleanup(self.remove, f"/api/appointments/{body['id']}")
        self.assertEqual(sorted(status for status, _ in results), [201, 409, 409, 409], results)

    def test_booking_timezone_and_updates(self):
        doctor, _, _ = self.doctor()
        payload = self.booking(doctor)
        date = dt.datetime.fromisoformat(payload['appointmentDate']).astimezone(dt.timezone(dt.timedelta(hours=2)))
        payload['appointmentDate'] = date.isoformat()
        appointment = self.create('/api/appointments', payload)
        status, body = request(f'/api/appointments/{appointment}')
        self.assertEqual(status, 200)
        self.assertTrue(body['appointmentDate'].endswith('Z'), body)
        self.assertEqual(dt.datetime.fromisoformat(body['appointmentDate']), date)
        payload['patientName'] = 'Updated Patient'
        self.assertEqual(request(f'/api/appointments/{appointment}', 'PUT', payload)[0], 204)
        self.assertEqual(request(f'/api/appointments/{appointment}')[1]['patientName'], 'Updated Patient')
        query = urllib.parse.urlencode({'from': (date - dt.timedelta(hours=1)).isoformat(),
                                        'to': (date + dt.timedelta(hours=1)).isoformat(), 'doctorId': doctor})
        status, body = request('/api/appointments?' + query)
        self.assertEqual(status, 200)
        self.assertEqual([row['id'] for row in body], [appointment])
        self.assertTrue(body[0]['appointmentDate'].endswith('Z'))

    def test_booking_errors_and_status(self):
        doctor, _, _ = self.doctor()
        payload = self.booking(doctor)
        payload['appointmentDate'] = '2000-01-01T00:00:00Z'
        status, body = request('/api/appointments', 'POST', payload)
        self.assertEqual(status, 400)
        self.assertIn('futura', body['detail'])
        self.assertEqual(request('/api/appointments/2147483647/status', 'PUT', {'status': 'Confermata'})[0], 404)
        self.assertEqual(request('/api/appointments/1/status', 'PUT', {'status': None})[0], 400)
        self.assertEqual(request('/api/appointments/1/status', 'PUT', {'status': 'Invalid'})[0], 400)
        self.assertEqual(request('/api/appointments?from=2030-01-02&to=2030-01-01')[0], 400)

    def test_products_filter_and_concurrent_stock(self):
        category = 'Test ' + self.suffix
        product = self.create('/api/products', {'name': category, 'category': category,
                            'price': 12.50, 'stockQuantity': 3, 'isActive': True})
        inactive = self.create('/api/products', {'name': category + ' inactive', 'category': category,
                            'price': 1, 'stockQuantity': 10, 'isActive': False})
        status, body = request('/api/products?active=false&' + urllib.parse.urlencode({'category': category, 'search': 'inactive'}))
        self.assertEqual(status, 200)
        self.assertEqual([row['id'] for row in body], [inactive])
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: request(f'/api/products/{product}/decrease-stock', 'POST', {'quantity': 1}), range(5)))
        self.assertEqual(sorted(status for status, _ in results), [200, 200, 200, 409, 409], results)
        self.assertEqual(sorted(body['stockQuantity'] for status, body in results if status == 200), [0, 1, 2])
        self.assertEqual(request(f'/api/products/{product}')[1]['stockQuantity'], 0)
        self.assertEqual(request(f'/api/products/{product}/decrease-stock', 'POST', {'quantity': 0})[0], 400)

    def test_services_and_schedules(self):
        doctor, specialty, _ = self.doctor()
        service = self.create('/api/medical-services', {'name': 'Test ' + self.suffix,
            'durationMinutes': 30, 'price': 50, 'isActive': True, 'specialtyId': specialty})
        link = f'/api/medical-services/{service}/doctors/{doctor}'
        self.assertEqual(request(link, 'PUT')[0], 204)
        self.assertEqual(request(link, 'PUT')[0], 204)
        self.assertEqual(request(link, 'DELETE')[0], 204)
        schedule_payload = {'doctorId': doctor, 'dayOfWeek': 1, 'startTime': '09:00:00',
                            'endTime': '12:00:00', 'slotDurationMinutes': 30, 'isActive': True}
        schedule = self.create('/api/doctor-schedules', schedule_payload)
        self.assertEqual(request('/api/doctor-schedules', 'POST', schedule_payload)[0], 409)
        self.assertEqual(request(f'/api/doctor-schedules/{schedule}', 'PUT', schedule_payload)[0], 204)
        self.assertEqual(len(request(f'/api/doctor-schedules?doctorId={doctor}')[1]), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
