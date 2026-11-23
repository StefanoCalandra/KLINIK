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

    def doctor(self, with_schedule=True):
        specialty = self.create('/api/specialties', {'name': 'Test ' + self.suffix})
        location = self.create('/api/locations', {'name': 'Test ' + self.suffix})
        doctor = self.create('/api/doctors', {
            'fullName': 'Test ' + self.suffix, 'isAvailable': True,
            'specialtyId': specialty, 'locationId': location})
        if with_schedule:
            for day in range(7):
                self.create('/api/doctor-schedules', {'doctorId': doctor, 'dayOfWeek': day,
                    'startTime': '09:00:00', 'endTime': '13:00:00', 'slotDurationMinutes': 30, 'isActive': True})
        return doctor, specialty, location

    def slots(self, doctor, date=None, service=None):
        date = date or (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).date().isoformat()
        query = {'date': date}
        if service is not None:
            query['medicalServiceId'] = service
        status, body = request(f'/api/doctors/{doctor}/slots?' + urllib.parse.urlencode(query))
        self.assertEqual(status, 200, body)
        return body

    def booking(self, doctor):
        slots = self.slots(doctor)
        self.assertTrue(slots)
        return {'patientName': 'Test Patient', 'phone': '+39 000 000000',
                'doctorId': doctor, 'status': 'In attesa', 'appointmentDate': slots[0]['startsAt']}

    def test_reference_data_and_routes(self):
        for path in ['/api/specialties', '/api/locations', '/api/doctors',
                     '/api/products', '/api/medical-services', '/api/doctor-schedules']:
            with self.subTest(path=path):
                status, body = request(path)
                self.assertEqual(status, 200, body)
                self.assertGreater(len(body), 0)
        self.assertEqual(request('/api/missing')[0], 404)
        self.assertEqual(request('/')[0], 200)

    def test_reference_batch_matches_routes_and_stays_fresh(self):
        doctor, specialty, location = self.doctor(with_schedule=False)
        status, batch = request('/api/reference-data')
        self.assertEqual(status, 200, batch)
        for key in ['specialties', 'locations']:
            code, original = request('/api/' + key)
            self.assertEqual(code, 200)
            self.assertEqual(batch[key], [{'id': item['id'], 'name': item['name']} for item in original])
        self.assertEqual(batch['doctors'], request('/api/doctors')[1])
        changed = 'Updated ' + self.suffix
        self.assertEqual(request(f'/api/specialties/{specialty}', 'PUT', {'name': changed})[0], 204)
        fresh = request('/api/reference-data')[1]
        self.assertEqual(next(x['name'] for x in fresh['specialties'] if x['id'] == specialty), changed)
        self.assertEqual(next(x['specialty'] for x in fresh['doctors'] if x['id'] == doctor), changed)

    def test_maximum_duration_and_adjacent_slot(self):
        doctor, specialty, _ = self.doctor(with_schedule=False)
        for day in range(7):
            self.create('/api/doctor-schedules', {'doctorId': doctor, 'dayOfWeek': day,
                'startTime': '08:00:00', 'endTime': '18:00:00', 'slotDurationMinutes': 30, 'isActive': True})
        service = self.create('/api/medical-services', {'name': 'Long ' + self.suffix,
            'durationMinutes': 480, 'price': 50, 'isActive': True, 'specialtyId': specialty})
        self.assertEqual(request(f'/api/medical-services/{service}/doctors/{doctor}', 'PUT')[0], 204)
        self.addCleanup(request, f'/api/medical-services/{service}/doctors/{doctor}', 'DELETE')
        slots = self.slots(doctor, service=service)
        payload = {**self.booking(doctor), 'appointmentDate': slots[0]['startsAt'], 'medicalServiceId': service}
        self.create('/api/appointments', payload)
        remaining = self.slots(doctor)
        self.assertEqual(len(remaining), 4)
        self.assertEqual(remaining[0]['startsAt'], slots[0]['endsAt'])
        overlap = dt.datetime.fromisoformat(slots[0]['endsAt']) - dt.timedelta(minutes=30)
        self.assertEqual(request('/api/appointments', 'POST', {**payload, 'medicalServiceId': None,
            'appointmentDate': overlap.isoformat()})[0], 409)
        self.create('/api/appointments', {**payload, 'medicalServiceId': None, 'appointmentDate': remaining[0]['startsAt']})

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
        doctor, specialty, _ = self.doctor(with_schedule=False)
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

    def test_slots_enforce_schedule_and_cancellation(self):
        doctor, _, _ = self.doctor()
        before = self.slots(doctor)
        self.assertEqual(len(before), 8)
        self.assertTrue(before[0]['startsAt'].endswith('Z'))
        payload = self.booking(doctor)
        invalid = {**payload, 'appointmentDate':
            (dt.datetime.fromisoformat(payload['appointmentDate']) + dt.timedelta(minutes=5)).isoformat()}
        self.assertEqual(request('/api/appointments', 'POST', invalid)[0], 409)
        appointment = self.create('/api/appointments', payload)
        self.assertEqual(len(self.slots(doctor)), 7)
        self.assertEqual(request(f'/api/appointments/{appointment}', 'PUT', invalid)[0], 409)
        self.assertEqual(request(f'/api/appointments/{appointment}/cancel', 'POST')[0], 204)
        self.assertEqual(len(self.slots(doctor)), 8)
        self.assertEqual(request(f'/api/appointments/{appointment}/status', 'PUT', {'status': 'Confermata'})[0], 204)
        self.assertEqual(len(self.slots(doctor)), 7)
        self.assertEqual(self.slots(doctor, '2000-01-01'), [])
        self.assertEqual(request(f'/api/doctors/{doctor}/slots?date=9999-12-31')[0], 400)
        self.assertEqual(request('/api/doctors/2147483647/slots?date=2030-01-01')[0], 404)

    def test_service_duration_prevents_overlaps(self):
        doctor, specialty, _ = self.doctor()
        service = self.create('/api/medical-services', {'name': 'Calendar ' + self.suffix,
            'durationMinutes': 45, 'price': 50, 'isActive': True, 'specialtyId': specialty})
        self.assertEqual(self.slots(doctor, service=service), [])
        self.assertEqual(request(f'/api/medical-services/{service}/doctors/{doctor}', 'PUT')[0], 204)
        self.addCleanup(request, f'/api/medical-services/{service}/doctors/{doctor}', 'DELETE')
        before = self.slots(doctor, service=service)
        self.assertEqual(len(before), 7)
        self.assertEqual(before[0]['durationMinutes'], 45)
        payload = {**self.booking(doctor), 'medicalServiceId': service}
        appointment = self.create('/api/appointments', payload)
        self.assertEqual(request(f'/api/appointments/{appointment}')[1]['durationMinutes'], 45)
        self.assertEqual(len(self.slots(doctor)), 6)
        # Un altro inizio, ma una visita sovrapposta, deve essere rifiutato.
        overlap = {**payload, 'appointmentDate': before[1]['startsAt']}
        self.assertEqual(request('/api/appointments', 'POST', overlap)[0], 409)
        self.assertEqual(request(f'/api/appointments/{appointment}/cancel', 'POST')[0], 204)
        other = self.create('/api/appointments', overlap)
        self.assertEqual(request(f'/api/appointments/{appointment}/status', 'PUT', {'status': 'Confermata'})[0], 409)
        self.assertEqual(request(f'/api/appointments/{appointment}')[1]['status'], 'Annullata')

    def test_absences_block_slots_and_conflicting_absences(self):
        doctor, _, _ = self.doctor()
        before = self.slots(doctor)
        absence_payload = {'doctorId': doctor, 'startsAt': before[0]['startsAt'], 'endsAt': before[1]['endsAt']}
        absence = self.create('/api/doctor-absences', absence_payload)
        self.assertEqual(len(self.slots(doctor)), 6)
        payload = {**self.booking(doctor), 'appointmentDate': before[0]['startsAt']}
        self.assertEqual(request('/api/appointments', 'POST', payload)[0], 409)
        self.assertEqual(request(f'/api/doctor-absences/{absence}', 'DELETE')[0], 204)
        appointment = self.create('/api/appointments', payload)
        self.assertEqual(request('/api/doctor-absences', 'POST', absence_payload)[0], 409)
        self.assertEqual(request('/api/doctor-absences', 'POST', {**absence_payload, 'endsAt': absence_payload['startsAt']})[0], 400)
        self.assertEqual(request(f'/api/appointments/{appointment}/cancel', 'POST')[0], 204)
        absence = self.create('/api/doctor-absences', absence_payload)
        self.assertEqual(request(f'/api/appointments/{appointment}/status', 'PUT', {'status': 'Confermata'})[0], 409)

    def test_concurrent_overlapping_visits_and_absence(self):
        doctor, specialty, _ = self.doctor()
        service = self.create('/api/medical-services', {'name': 'Concurrent ' + self.suffix,
            'durationMinutes': 45, 'price': 50, 'isActive': True, 'specialtyId': specialty})
        request(f'/api/medical-services/{service}/doctors/{doctor}', 'PUT')
        self.addCleanup(request, f'/api/medical-services/{service}/doctors/{doctor}', 'DELETE')
        slots = self.slots(doctor, service=service)
        payload = {**self.booking(doctor), 'medicalServiceId': service}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda slot: request('/api/appointments', 'POST',
                {**payload, 'appointmentDate': slot['startsAt']}), slots[:2]))
        for status, body in results:
            if status == 201:
                self.addCleanup(self.remove, f"/api/appointments/{body['id']}")
                self.assertEqual(request(f"/api/appointments/{body['id']}/cancel", 'POST')[0], 204)
        self.assertEqual(sorted(status for status, _ in results), [201, 409], results)
        absence = {'doctorId': doctor, 'startsAt': slots[0]['startsAt'], 'endsAt': slots[0]['endsAt']}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            calls = [('/api/appointments', payload), ('/api/doctor-absences', absence)]
            results = list(pool.map(lambda call: request(call[0], 'POST', call[1]), calls))
        for (path, _), (status, body) in zip(calls, results):
            if status == 201:
                self.addCleanup(self.remove, f"{path}/{body['id']}")
        self.assertEqual(sorted(status for status, _ in results), [201, 409], results)

    def test_clinic_timezone_winter_summer_and_dst(self):
        from zoneinfo import ZoneInfo
        doctor, _, _ = self.doctor()
        year = dt.datetime.now(dt.timezone.utc).year + 1
        for month in [1, 7]:
            date = f'{year}-{month:02d}-15'
            slots = self.slots(doctor, date)
            first = dt.datetime.fromisoformat(slots[0]['startsAt'])
            self.assertEqual(first.astimezone(ZoneInfo('Europe/Rome')).hour, 9)
            self.assertEqual(first.hour, 8 if month == 1 else 7)
        # Ultima domenica di marzo: l'ora 02:xx non esiste in Europe/Rome.
        date = dt.date(year, 3, 31)
        while date.weekday() != 6:
            date -= dt.timedelta(days=1)
        self.create('/api/doctor-schedules', {'doctorId': doctor, 'dayOfWeek': 0,
            'startTime': '01:00:00', 'endTime': '04:00:00', 'slotDurationMinutes': 30, 'isActive': True})
        slots = self.slots(doctor, date.isoformat())
        starts = [x['startsAt'] for x in slots]
        self.assertEqual(len(starts), len(set(starts)))
        self.assertFalse(any(dt.datetime.fromisoformat(x).astimezone(ZoneInfo('Europe/Rome')).hour == 2 for x in starts))
        self.assertTrue(any(dt.datetime.fromisoformat(x).astimezone(ZoneInfo('Europe/Rome')).hour == 3 for x in starts))


if __name__ == '__main__':
    unittest.main(verbosity=2)
