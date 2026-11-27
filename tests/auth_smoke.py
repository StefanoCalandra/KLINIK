"""Run only against a development database: temporarily changes and restores admin credentials."""
import http.cookiejar
import json
import os
import urllib.request
import urllib.error
import unittest

BASE = os.environ.get('KLINIK_API_URL', 'http://127.0.0.1:5043').rstrip('/')
USERNAME = os.environ.get('KLINIK_ADMIN_USERNAME', 'admin')
PASSWORD = os.environ.get('KLINIK_ADMIN_PASSWORD', 'admin')

class Client:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.token = None
        self.headers = None

    def request(self, path, method='GET', data=None, csrf=True):
        headers = {'Content-Type': 'application/json'}
        if csrf and self.token:
            headers['X-CSRF-TOKEN'] = self.token
        req = urllib.request.Request(BASE+path, data=json.dumps(data).encode() if data is not None else None,
                                     headers=headers, method=method)
        try:
            response = self.opener.open(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            self.headers = response.headers
            body = response.read()
            return response.code, json.loads(body) if body and 'json' in response.headers.get('Content-Type', '') else body.decode()

    def session(self):
        status, session = self.request('/api/admin/session')
        assert status == 200
        self.token = session['csrfToken']
        return session

    def login(self, username=USERNAME, password=PASSWORD):
        self.session()
        status, body = self.request('/api/admin/login', 'POST', {'username': username, 'password': password})
        if status == 200:
            self.session()
        return status, body

class AuthTests(unittest.TestCase):
    def test_anonymous_permissions_and_csrf(self):
        client = Client()
        for path in ['/api/appointments', '/api/appointments/1', '/api/admin/appointments?from=2026-01-01&to=2026-01-02', '/api/doctor-absences?doctorId=1']:
            self.assertEqual(client.request(path)[0], 401, path)
        for path, method, payload in [('/api/specialties', 'POST', {'name': 'Unauthorized'}),
            ('/api/appointments/1/status', 'PUT', {'status': 'Confermata'}),
            ('/api/appointments/1', 'DELETE', None),
            ('/api/admin/credentials', 'PUT', {}), ('/api/admin/logout', 'POST', None)]:
            self.assertEqual(client.request(path, method, payload)[0], 401, path)
        self.assertEqual(client.request('/api/reference-data')[0], 200)
        self.assertEqual(set(client.session()), {'authenticated', 'username', 'csrfToken'})
        self.assertEqual(client.request('/api/appointments', 'POST', {})[0], 400, 'Public booking reaches validation')
        self.assertEqual(client.request('/api/admin/login', 'POST', {'username': USERNAME, 'password': PASSWORD}, csrf=False)[0], 400)
        self.assertEqual(client.login(password='wrong-password')[0], 401)
        self.assertEqual(client.login(username='wrong-username')[0], 401)
        self.assertEqual(client.login()[0], 200)
        self.assertEqual(client.request('/api/appointments')[0], 200)
        self.assertEqual(client.headers.get('Cache-Control'), 'no-store')
        auth_cookie = next(cookie for cookie in client.cookies if cookie.name == 'Klinik.Admin')
        attributes = {key.lower(): value for key, value in auth_cookie._rest.items()}
        self.assertIn('httponly', attributes)
        self.assertEqual(attributes['samesite'].lower(), 'strict')
        self.assertEqual(client.request('/api/specialties', 'POST', {'name': 'No CSRF'}, csrf=False)[0], 400)
        self.assertEqual(client.request('/api/admin/credentials', 'PUT', {}, csrf=False)[0], 400)
        self.assertEqual(client.request('/api/admin/logout', 'POST')[0], 204)
        self.assertFalse(client.session()['authenticated'])
        self.assertEqual(client.request('/api/appointments')[0], 401)

    def test_credentials_change_and_session_revocation(self):
        owner, other = Client(), Client()
        self.assertEqual(owner.login()[0], 200)
        self.assertEqual(other.login()[0], 200)
        new_user, new_password = 'admin-test-change', 'Temporary test password 42!'
        payload = {'username': new_user, 'currentPassword': PASSWORD, 'newPassword': new_password, 'confirmPassword': new_password}
        self.assertEqual(owner.request('/api/admin/credentials', 'PUT', {**payload, 'currentPassword': 'wrong'})[0], 400)
        self.assertEqual(owner.request('/api/admin/credentials', 'PUT', {**payload, 'confirmPassword': 'different'})[0], 400)
        self.assertEqual(owner.request('/api/admin/credentials', 'PUT', payload)[0], 200)
        try:
            self.assertEqual(owner.session()['username'], new_user)
            self.assertEqual(other.request('/api/appointments')[0], 401)
            self.assertFalse(other.session()['authenticated'])
            self.assertEqual(Client().login()[0], 401)
            self.assertEqual(Client().login(new_user, new_password)[0], 200)
        finally:
            restore = Client()
            assert restore.login(new_user, new_password)[0] == 200
            status, body = restore.request('/api/admin/credentials', 'PUT', {'username': USERNAME,
                'currentPassword': new_password, 'newPassword': PASSWORD, 'confirmPassword': PASSWORD})
            self.assertEqual(status, 200, body)
        self.assertEqual(Client().login()[0], 200)

if __name__ == '__main__':
    unittest.main(verbosity=2)
