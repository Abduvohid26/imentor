from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient


@override_settings(SECURE_SSL_REDIRECT=False, ALLOW_LEGACY_PREPARED_CONTENT_API=True)
class PreparedContentApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def _register_user(self, phone: str, password: str, role: str = 'hodim', **extra) -> dict:
        payload = {
            'phone_digits': phone,
            'password': password,
            'role': role,
            'register': True,
            **extra,
        }
        resp = self.client.post('/api/v1/auth/local-login/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()

    def _login_user(self, phone: str, password: str, **extra) -> dict:
        payload = {'phone_digits': phone, 'password': password, **extra}
        resp = self.client.post('/api/v1/auth/local-login/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()

    def _ensure_admin_user(self, phone: str = '998901110001', password: str = 'AdminDemo123') -> dict:
        user, created = User.objects.get_or_create(
            username=phone,
            defaults={'first_name': 'Admin', 'last_name': 'Demo'},
        )
        if created or not user.has_usable_password():
            user.set_password(password)
            user.save(update_fields=['password'])
        group, _ = Group.objects.get_or_create(name='admin')
        user.groups.add(group)
        return self._login_user(phone, password)

    def test_create_and_get_latest_prepared_content(self):
        payload = {
            'owner_key': '998901112233',
            'kind': 'lecture',
            'topic': "Yurak yetishmovchiligi",
            'topic_norm': "yurak yetishmovchiligi",
            'payload': {'content': 'demo'},
        }
        create_resp = self.client.post('/api/prepared-content/', payload, format='json')
        self.assertEqual(create_resp.status_code, 201)

        get_resp = self.client.get(
            '/api/prepared-content/',
            {
                'owner_key': '998901112233',
                'kind': 'lecture',
                'topic_norm': 'yurak yetishmovchiligi',
            },
        )
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()['kind'], 'lecture')

    def test_get_requires_query_params(self):
        resp = self.client.get('/api/prepared-content/')
        self.assertEqual(resp.status_code, 400)

    def test_get_without_existing_record_returns_empty_payload(self):
        resp = self.client.get(
            '/api/prepared-content/',
            {
                'owner_key': '998901112233',
                'kind': 'case',
                'topic_norm': 'unknown-topic',
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('payload'), None)

    def test_v1_requires_jwt(self):
        resp = self.client.get('/api/v1/prepared-content/')
        self.assertEqual(resp.status_code, 401)

    @override_settings(ALLOW_LEGACY_PREPARED_CONTENT_API=False)
    def test_legacy_api_can_be_disabled(self):
        resp = self.client.get('/api/prepared-content/')
        self.assertEqual(resp.status_code, 403)

    def test_local_login_and_v1_prepared_content_flow(self):
        Group.objects.get_or_create(name='hodim')
        access = self._register_user(
            '998901112233',
            'StrongPass123',
            first_name='Test',
            last_name='Hodim',
        )['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        create_resp = self.client.post(
            '/api/v1/prepared-content/',
            {
                'kind': 'lecture',
                'topic': 'Bronxial astma',
                'topic_norm': 'bronxial astma',
                'payload': {'content': 'demo'},
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201)
        self.assertEqual(create_resp.json()['owner_key'], '998901112233')

        get_resp = self.client.get(
            '/api/v1/prepared-content/',
            {'kind': 'lecture', 'topic_norm': 'bronxial astma'},
        )
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()['owner_key'], '998901112233')
        self.assertTrue(User.objects.filter(username='998901112233').exists())

        miss_resp = self.client.get(
            '/api/v1/prepared-content/',
            {'kind': 'lecture', 'topic_norm': 'non-existent'},
        )
        self.assertEqual(miss_resp.status_code, 200)
        self.assertEqual(miss_resp.json().get('payload'), None)

    def test_syllabus_list_create_delete_flow(self):
        Group.objects.get_or_create(name='hodim')
        access = self._register_user(
            '998901112233',
            'StrongPass123',
            first_name='Test',
            last_name='Hodim',
        )['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        list0 = self.client.get('/api/v1/syllabuses/')
        self.assertEqual(list0.status_code, 200)
        self.assertEqual(list0.json(), [])

        create = self.client.post(
            '/api/v1/syllabuses/',
            {
                'external_id': 'local_syl_1',
                'file_name': 'demo.pdf',
                'topics': [
                    {'id': 'M1', 'title': 'Tema 1', 'type': 'lecture'},
                ],
            },
            format='json',
        )
        self.assertEqual(create.status_code, 201)
        sid = create.json()['id']

        list1 = self.client.get('/api/v1/syllabuses/')
        self.assertEqual(list1.status_code, 200)
        self.assertEqual(len(list1.json()), 1)

        del_resp = self.client.delete(f'/api/v1/syllabuses/{sid}/')
        self.assertEqual(del_resp.status_code, 204)

        list2 = self.client.get('/api/v1/syllabuses/')
        self.assertEqual(list2.json(), [])

    def test_live_test_session_public_qr_flow(self):
        Group.objects.get_or_create(name='hodim')
        access = self._register_user(
            '998901112233',
            'StrongPass123',
            first_name='Test',
            last_name='Hodim',
        )['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        q = {
            'question': 'Clinical vignette text here.',
            'options': ['A opt', 'B opt', 'C opt', 'D opt', 'E opt'],
            'correctOptionIndex': 2,
            'explanation': 'Because clinical reasoning.',
        }
        up = self.client.post(
            '/api/v1/live-tests/',
            {
                'session_key': 'lts_qr_demo_1',
                'topic': 'Demo mavzu',
                'questions': [q],
            },
            format='json',
        )
        self.assertEqual(up.status_code, 200)

        self.client.credentials()
        pub = self.client.get('/api/v1/live-tests/lts_qr_demo_1/')
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.json()['topic'], 'Demo mavzu')
        pub_q = pub.json()['questions'][0]
        self.assertNotIn('correctOptionIndex', pub_q)
        self.assertNotIn('explanation', pub_q)

        sub = self.client.post(
            '/api/v1/live-tests/lts_qr_demo_1/submissions/',
            {
                'first_name': 'Ali',
                'last_name': 'Valiyev',
                'answers': [2],
            },
            format='json',
        )
        self.assertEqual(sub.status_code, 201)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        lst = self.client.get('/api/v1/live-tests/lts_qr_demo_1/submissions/')
        self.assertEqual(lst.status_code, 200)
        self.assertEqual(len(lst.json()), 1)
        self.assertEqual(lst.json()[0]['last_name'], 'Valiyev')

    def test_live_test_finalize_auto_submits_drafts(self):
        Group.objects.get_or_create(name='hodim')
        access = self._register_user(
            '998901112244',
            'StrongPass123',
            first_name='Demo',
            last_name='Teacher',
        )['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        q = {
            'question': 'Clinical vignette text here.',
            'options': ['A opt', 'B opt', 'C opt', 'D opt', 'E opt'],
            'correctOptionIndex': 2,
            'explanation': 'Because clinical reasoning.',
        }
        self.client.post(
            '/api/v1/live-tests/',
            {
                'session_key': 'lts_finalize_demo',
                'topic': 'Finalize mavzu',
                'questions': [q],
            },
            format='json',
        )

        self.client.credentials()
        self.client.post(
            '/api/v1/live-tests/lts_finalize_demo/drafts/',
            {
                'participant_key': 'part_complete',
                'first_name': 'Ali',
                'last_name': 'Complete',
                'answers': [2],
            },
            format='json',
        )
        self.client.post(
            '/api/v1/live-tests/lts_finalize_demo/drafts/',
            {
                'participant_key': 'part_incomplete',
                'first_name': 'Vali',
                'last_name': 'Incomplete',
                'answers': [-1],
            },
            format='json',
        )

        pub = self.client.get('/api/v1/live-tests/lts_finalize_demo/')
        self.assertFalse(pub.json()['is_closed'])

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        fin = self.client.post('/api/v1/live-tests/lts_finalize_demo/finalize/')
        self.assertEqual(fin.status_code, 200)
        body = fin.json()
        self.assertTrue(body['is_closed'])
        self.assertEqual(body['auto_submitted'], 2)
        self.assertEqual(len(body['submissions']), 2)

        self.client.credentials()
        closed = self.client.get('/api/v1/live-tests/lts_finalize_demo/')
        self.assertTrue(closed.json()['is_closed'])
        blocked = self.client.post(
            '/api/v1/live-tests/lts_finalize_demo/submissions/',
            {
                'first_name': 'Late',
                'last_name': 'Student',
                'answers': [2],
            },
            format='json',
        )
        self.assertEqual(blocked.status_code, 403)

    def test_content_catalog_one_hour_delay(self):
        from datetime import timedelta

        from core.models import PreparedContent

        Group.objects.get_or_create(name='hodim')
        access = self._register_user(
            '998901113355',
            'StrongPass123',
            first_name='Catalog',
            last_name='Teacher',
        )['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        recent = PreparedContent.objects.create(
            owner_key='998901113355',
            kind=PreparedContent.KIND_CASE,
            topic='Yangi keys',
            topic_norm='yangi keys',
            author_display_name='Catalog Teacher',
            subject_name='Anatomiya',
            subject_code='ANAT',
            payload={'topic': 'Yangi keys', 'questions': [{'scenario': 's', 'answer': 'a'}]},
        )
        old = PreparedContent.objects.create(
            owner_key='998901113355',
            kind=PreparedContent.KIND_TEST,
            topic='Eski test',
            topic_norm='eski test',
            author_display_name='Catalog Teacher',
            subject_name='Anatomiya',
            subject_code='ANAT',
            payload={'topic': 'Eski test', 'questions': [{'question': 'q', 'options': ['a'], 'correctOptionIndex': 0, 'explanation': 'e'}]},
        )
        PreparedContent.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )

        lst = self.client.get('/api/v1/content-catalog/')
        self.assertEqual(lst.status_code, 200)
        catalog_items = lst.json().get('results', lst.json())
        self.assertEqual(len(catalog_items), 1)
        self.assertEqual(catalog_items[0]['topic'], 'Eski test')

        detail = self.client.get(f'/api/v1/content-catalog/{old.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertIn('payload', detail.json())

        blocked = self.client.get(f'/api/v1/content-catalog/{recent.pk}/')
        self.assertEqual(blocked.status_code, 404)

        subjects = self.client.get('/api/v1/content-catalog/subjects/')
        self.assertEqual(subjects.status_code, 200)
        self.assertEqual(subjects.json()[0]['subject_name'], 'Anatomiya')

    @override_settings(EXTERNAL_API_KEYS='ext-test-key-123')
    def test_admin_and_external_test_stats(self):
        from datetime import timedelta

        from core.models import PreparedContent

        admin_bundle = self._ensure_admin_user()
        admin_access = admin_bundle['access']

        hodim = self._register_user('998901114466', 'StrongPass123', first_name='Test', last_name='Teacher')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {hodim["access"]}')
        create_resp = self.client.post(
            '/api/v1/prepared-content/',
            {
                'kind': 'test',
                'topic': 'Yurak anatomiyasi',
                'topic_norm': '12::pi::m1',
                'variant_label': 'PI',
                'topic_code': 'm1',
                'subject_name': 'Anatomiya',
                'subject_code': 'ANAT',
                'author_display_name': 'Test Teacher',
                'payload': {
                    'topic': 'Yurak anatomiyasi',
                    'questions': [
                        {
                            'question': f'Q{i}',
                            'options': ['a', 'b', 'c', 'd', 'e'],
                            'correctOptionIndex': 0,
                            'explanation': f'explanation {i}',
                        }
                        for i in range(1, 16)
                    ],
                },
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201, create_resp.content)
        self.assertEqual(create_resp.json()['variant_label'], 'PI')
        self.assertEqual(create_resp.json()['topic_code'], 'm1')

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_access}')
        stats = self.client.get('/api/v1/admin/content-catalog/stats/?kind=test')
        self.assertEqual(stats.status_code, 200)
        body = stats.json()
        self.assertGreaterEqual(body['totals']['test_count'], 1)
        self.assertGreaterEqual(body['totals']['subjects_distinct'], 1)
        self.assertTrue(any(row['subject_code'] == 'ANAT' for row in body['by_subject']))

        blocked = self.client.get('/api/v1/external/tests/stats/')
        self.assertEqual(blocked.status_code, 403)

        self.client.credentials()
        ext_blocked = self.client.get(
            '/api/v1/external/tests/stats/',
            HTTP_X_API_KEY='wrong-key',
        )
        self.assertEqual(ext_blocked.status_code, 403)

        ext_stats = self.client.get(
            '/api/v1/external/tests/stats/',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(ext_stats.status_code, 200)
        self.assertEqual(ext_stats.json()['kind'], 'test')

        recent_pk = create_resp.json()['id']
        ext_list = self.client.get(
            '/api/v1/external/tests/',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(ext_list.status_code, 200)
        self.assertEqual(ext_list.json().get('results', ext_list.json()), [])

        PreparedContent.objects.filter(pk=recent_pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        ext_list2 = self.client.get(
            '/api/v1/external/tests/',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        items = ext_list2.json().get('results', ext_list2.json())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['variant_label'], 'PI')
        self.assertEqual(items[0]['question_count'], 15)

        bad_limit = self.client.get(
            f'/api/v1/external/tests/{recent_pk}/?question_limit=5',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(bad_limit.status_code, 400)

        limited = self.client.get(
            f'/api/v1/external/tests/{recent_pk}/?question_limit=12',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(limited.status_code, 200)
        limited_body = limited.json()
        self.assertEqual(limited_body['question_limit'], 12)
        self.assertEqual(limited_body['question_count_available'], 15)
        self.assertEqual(limited_body['question_count_returned'], 12)
        self.assertEqual(len(limited_body['payload']['questions']), 12)

        filtered = self.client.get(
            '/api/v1/external/tests/?min_questions=20',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.json().get('results', []), [])

        filtered_ok = self.client.get(
            '/api/v1/external/tests/?min_questions=10&max_questions=15',
            HTTP_X_API_KEY='ext-test-key-123',
        )
        self.assertEqual(filtered_ok.status_code, 200)
        self.assertEqual(len(filtered_ok.json().get('results', [])), 1)

    @override_settings(EXTERNAL_API_KEYS='ext-test-key-123')
    def test_external_catalog_and_tests_flow(self):
        from datetime import timedelta

        from core.models import AcademicDepartment, CourseSyllabus, PreparedContent

        dept = AcademicDepartment.objects.create(name='Anatomiya kafedrasi', code='anat-kaf', sort_order=1)
        CourseSyllabus.objects.create(
            subject_name='Anatomiya',
            subject_code='ANAT-CAT',
            department=dept,
            variants=[
                {
                    'label': 'PI',
                    'file_name': 'Anatomiya(PI).pdf',
                    'topics': [
                        {'id': 'M1', 'title': 'Yurak anatomiyasi', 'type': 'lecture'},
                        {'id': 'M2', 'title': 'Miya anatomiyasi', 'type': 'lecture'},
                    ],
                }
            ],
            topics=[{'id': 'M1', 'title': 'Yurak anatomiyasi', 'type': 'lecture'}],
        )

        headers = {'HTTP_X_API_KEY': 'ext-test-key-123'}

        cat_stats = self.client.get('/api/v1/external/catalog/stats/', **headers)
        self.assertEqual(cat_stats.status_code, 200)
        cat_body = cat_stats.json()
        self.assertGreaterEqual(cat_body['departments_count'], 1)
        self.assertGreaterEqual(cat_body['subjects_count'], 1)
        self.assertGreaterEqual(cat_body['variants_count'], 1)
        self.assertGreaterEqual(cat_body['topics_count'], 2)

        depts = self.client.get('/api/v1/external/catalog/departments/', **headers)
        self.assertEqual(depts.status_code, 200)
        dept_body = depts.json()
        self.assertGreaterEqual(dept_body['count'], 1)
        self.assertIn('next_step', dept_body)
        self.assertTrue(any(d['code'] == 'anat-kaf' and d['subjects_count'] >= 1 for d in dept_body['results']))

        dept_subjects = self.client.get('/api/v1/external/catalog/departments/anat-kaf/subjects/', **headers)
        self.assertEqual(dept_subjects.status_code, 200)
        ds_body = dept_subjects.json()
        self.assertEqual(ds_body['department']['name'], 'Anatomiya kafedrasi')
        self.assertTrue(any(r['subject_code'] == 'ANAT-CAT' for r in ds_body['results']))

        subjects = self.client.get(
            '/api/v1/external/catalog/subjects/?department_code=anat-kaf',
            **headers,
        )
        self.assertEqual(subjects.status_code, 200)
        subj_rows = subjects.json()['results']
        self.assertTrue(any(r['subject_code'] == 'ANAT-CAT' for r in subj_rows))

        detail = self.client.get('/api/v1/external/catalog/subjects/ANAT-CAT/', **headers)
        self.assertEqual(detail.status_code, 200)
        detail_body = detail.json()
        self.assertEqual(detail_body['subject_name'], 'Anatomiya')
        self.assertEqual(detail_body['department_name'], 'Anatomiya kafedrasi')
        self.assertEqual(detail_body['variants'][0]['label'], 'PI')
        self.assertEqual(len(detail_body['variants'][0]['topics']), 2)

        dept_detail = self.client.get('/api/v1/external/catalog/departments/anat-kaf/', **headers)
        self.assertEqual(dept_detail.status_code, 200)
        dept_body = dept_detail.json()
        self.assertEqual(dept_body['name'], 'Anatomiya kafedrasi')
        self.assertTrue(any(s['subject_code'] == 'ANAT-CAT' for s in dept_body['subjects']))

        hodim = self._register_user('998901114477', 'StrongPass123', first_name='Cat', last_name='Teacher')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {hodim["access"]}')
        create_resp = self.client.post(
            '/api/v1/prepared-content/',
            {
                'kind': 'test',
                'topic': 'Yurak anatomiyasi',
                'topic_norm': f'{CourseSyllabus.objects.get(subject_code="ANAT-CAT").pk}::pi::m1',
                'variant_label': 'PI',
                'topic_code': 'm1',
                'subject_name': 'Anatomiya',
                'subject_code': 'ANAT-CAT',
                'author_display_name': 'Cat Teacher',
                'payload': {
                    'topic': 'Yurak anatomiyasi',
                    'questions': [
                        {
                            'question': f'Q{i}',
                            'options': ['a', 'b', 'c', 'd', 'e'],
                            'correctOptionIndex': 0,
                            'explanation': 'ex',
                        }
                        for i in range(1, 11)
                    ],
                },
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201)
        test_pk = create_resp.json()['id']
        syllabus_id = CourseSyllabus.objects.get(subject_code='ANAT-CAT').pk

        self.client.credentials()
        PreparedContent.objects.filter(pk=test_pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )

        by_syllabus = self.client.get(
            f'/api/v1/external/tests/?syllabus_id={syllabus_id}&subject_code=ANAT-CAT&topic_code=m1',
            **headers,
        )
        self.assertEqual(by_syllabus.status_code, 200)
        self.assertEqual(len(by_syllabus.json()['results']), 1)
        test_row = by_syllabus.json()['results'][0]
        self.assertEqual(test_row['department_name'], 'Anatomiya kafedrasi')
        self.assertEqual(test_row['department_code'], 'anat-kaf')
        self.assertEqual(test_row['subject_name'], 'Anatomiya')

    def test_login_preserves_server_role_from_db(self):
        Group.objects.get_or_create(name='hodim')
        Group.objects.get_or_create(name='startuper')
        phone = '998901119999'
        self._register_user(phone, 'StrongPass123', first_name='Ali', last_name='Valiyev')

        admin_bundle = self._ensure_admin_user()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_bundle["access"]}')
        self.client.post(
            '/api/v1/auth/admin-provision-staff/',
            {
                'phone_digits': phone,
                'password': 'StrongPass123',
                'role': 'startuper',
                'first_name': 'Ali',
                'last_name': 'Valiyev',
            },
            format='json',
        )

        login_resp = self._login_user(phone, 'StrongPass123', role='hodim')
        self.assertEqual(login_resp['role'], 'startuper')

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp["access"]}')
        apps_resp = self.client.get('/api/v1/startup-applications/')
        self.assertEqual(apps_resp.status_code, 200)
        my_syllabus_resp = self.client.get('/api/v1/course-syllabuses/my/')
        self.assertEqual(my_syllabus_resp.status_code, 403)

    def test_login_rejects_unknown_user_without_register(self):
        resp = self.client.post(
            '/api/v1/auth/local-login/',
            {'phone_digits': '998909999999', 'password': 'StrongPass123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_admin_provision_staff_creates_and_updates_password(self):
        Group.objects.get_or_create(name='admin')
        Group.objects.get_or_create(name='hodim')
        admin_bundle = self._ensure_admin_user()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_bundle["access"]}')

        staff_phone = '998909998877'
        create_resp = self.client.post(
            '/api/v1/auth/admin-provision-staff/',
            {
                'phone_digits': staff_phone,
                'password': 'StaffPass123',
                'role': 'hodim',
                'first_name': 'Yangi',
                'last_name': 'Hodim',
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201)
        self.assertTrue(create_resp.json()['created'])

        staff_login = self.client.post(
            '/api/v1/auth/local-login/',
            {
                'phone_digits': staff_phone,
                'password': 'StaffPass123',
            },
            format='json',
        )
        self.assertEqual(staff_login.status_code, 200)
        self.assertEqual(staff_login.json()['role'], 'hodim')

        update_resp = self.client.post(
            '/api/v1/auth/admin-provision-staff/',
            {
                'phone_digits': staff_phone,
                'password': 'NewPass456',
                'role': 'hodim',
                'first_name': 'Yangi',
                'last_name': 'Hodim',
            },
            format='json',
        )
        self.assertEqual(update_resp.status_code, 200)
        self.assertFalse(update_resp.json()['created'])

        bad_login = self.client.post(
            '/api/v1/auth/local-login/',
            {
                'phone_digits': staff_phone,
                'password': 'StaffPass123',
                'role': 'hodim',
            },
            format='json',
        )
        self.assertEqual(bad_login.status_code, 401)

        good_login = self._login_user(staff_phone, 'NewPass456')
        self.assertEqual(good_login['role'], 'hodim')

    def test_change_password_and_deprovision(self):
        Group.objects.get_or_create(name='hodim')
        phone = '998901115555'
        bundle = self._register_user(phone, 'OldPass123', first_name='Test', last_name='User')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {bundle["access"]}')
        change = self.client.post(
            '/api/v1/auth/change-password/',
            {'current_password': 'OldPass123', 'new_password': 'NewPass789'},
            format='json',
        )
        self.assertEqual(change.status_code, 200)
        self._login_user(phone, 'NewPass789')

        admin_bundle = self._ensure_admin_user()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_bundle["access"]}')
        deprov = self.client.post(
            '/api/v1/auth/admin-deprovision-staff/',
            {'phone_digits': phone},
            format='json',
        )
        self.assertEqual(deprov.status_code, 204)
        self.assertFalse(User.objects.filter(username=phone).exists())

    def test_device_pair_status_requires_desktop_secret(self):
        from core.models import DevicePairingSession
        from django.utils import timezone
        from datetime import timedelta

        create = self.client.post('/api/v1/device-pair/create/', {}, format='json')
        self.assertEqual(create.status_code, 201)
        token = create.json()['pairing_token']
        secret = create.json()['desktop_secret']

        legacy_poll = self.client.get(f'/api/v1/device-pair/status/{token}/')
        self.assertEqual(legacy_poll.status_code, 403)

        wrong_secret = self.client.get(f'/api/v1/device-pair/status/{token}/?secret=wrong-value')
        self.assertEqual(wrong_secret.status_code, 403)

        pending = self.client.get(f'/api/v1/device-pair/status/{token}/?secret={secret}')
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(pending.json()['status'], 'pending')

        obj = DevicePairingSession.objects.get(pairing_token=token)
        obj.status = DevicePairingSession.STATUS_CONFIRMED
        obj.access_token = 'access-demo'
        obj.refresh_token = 'refresh-demo'
        obj.role = 'hodim'
        obj.owner_key = '998901112233'
        obj.save()

        confirmed = self.client.get(f'/api/v1/device-pair/status/{token}/?secret={secret}')
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.json()['access'], 'access-demo')

    def test_staff_avatar_upload_and_login_photo_url(self):
        Group.objects.get_or_create(name='hodim')
        login = self._register_user('998901119999', 'AvatarPass123')
        self.assertEqual(login.get('photo_url'), '')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login["access"]}')

        from django.core.files.uploadedfile import SimpleUploadedFile

        png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
            b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        upload = self.client.post(
            '/api/v1/auth/me/avatar/',
            {'file': SimpleUploadedFile('avatar.png', png, content_type='image/png')},
            format='multipart',
        )
        self.assertEqual(upload.status_code, 200, upload.content)
        photo_url = upload.json().get('photo_url', '')
        self.assertTrue(photo_url)

        me = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json().get('photo_url'), photo_url)

        relogin = self._login_user('998901119999', 'AvatarPass123')
        self.assertEqual(relogin.get('photo_url'), photo_url)

        delete = self.client.delete('/api/v1/auth/me/avatar/')
        self.assertEqual(delete.status_code, 204)

        relogin_empty = self._login_user('998901119999', 'AvatarPass123')
        self.assertEqual(relogin_empty.get('photo_url'), '')

    def test_staff_avatar_rejects_non_image_magic(self):
        Group.objects.get_or_create(name='hodim')
        login = self._register_user('998901118888', 'AvatarPass123')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login["access"]}')
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake = SimpleUploadedFile('evil.jpg', b'<?php echo 1; ?>', content_type='image/jpeg')
        resp = self.client.post('/api/v1/auth/me/avatar/', {'file': fake}, format='multipart')
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_staff_avatar_url_has_cache_bust(self):
        Group.objects.get_or_create(name='hodim')
        login = self._register_user('998901117777', 'AvatarPass123')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login["access"]}')
        from django.core.files.uploadedfile import SimpleUploadedFile

        png = SimpleUploadedFile(
            'avatar.png',
            (
                b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
                b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f'
                b'\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
            ),
            content_type='image/png',
        )
        upload = self.client.post('/api/v1/auth/me/avatar/', {'file': png}, format='multipart')
        self.assertEqual(upload.status_code, 200, upload.content)
        photo_url = upload.json().get('photo_url', '')
        self.assertIn('v=', photo_url)


@override_settings(SECURE_SSL_REDIRECT=False)
class SecurityAndFeatureApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def _register_hodim(self, phone: str = '998901112299', password: str = 'StrongPass123') -> str:
        Group.objects.get_or_create(name='hodim')
        resp = self.client.post(
            '/api/v1/auth/local-login/',
            {
                'phone_digits': phone,
                'password': password,
                'role': 'hodim',
                'register': True,
                'first_name': 'Test',
                'last_name': 'Hodim',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()['access']

    def test_migrate_endpoint_removed(self):
        resp = self.client.get('/api/v1/migrate/full-export/')
        self.assertEqual(resp.status_code, 404)

    def test_live_test_server_generates_session_key(self):
        access = self._register_hodim('998901112288')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        q = {
            'question': 'Clinical vignette text here.',
            'options': ['A opt', 'B opt', 'C opt', 'D opt', 'E opt'],
            'correctOptionIndex': 2,
            'explanation': 'Because clinical reasoning.',
        }
        up = self.client.post(
            '/api/v1/live-tests/',
            {'topic': 'Server key mavzu', 'questions': [q]},
            format='json',
        )
        self.assertEqual(up.status_code, 200, up.content)
        body = up.json()
        self.assertTrue(body.get('session_key', '').startswith('lts_'))
        self.assertTrue(body.get('ok'))

        self.client.credentials()
        pub = self.client.get(f'/api/v1/live-tests/{body["session_key"]}/')
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.json()['topic'], 'Server key mavzu')

    def test_staff_location_ping_accepts_hodim(self):
        from core.models import CampusBuilding

        access = self._register_hodim('998901112277')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        CampusBuilding.objects.create(
            name='Test bino',
            short_code='TB1',
            latitude=40.384,
            longitude=71.784,
            radius_m=120,
            is_active=True,
        )
        resp = self.client.post(
            '/api/v1/staff/location-ping/',
            {'latitude': 40.3841, 'longitude': 71.7841, 'accuracy_m': 12},
            format='json',
        )
        self.assertIn(resp.status_code, (200, 201), resp.content)
        self.assertTrue(resp.json().get('ok'))

    def test_admin_clinical_group_crud(self):
        Group.objects.get_or_create(name='admin')
        admin_user, _ = User.objects.get_or_create(username='998901110001')
        admin_user.set_password('AdminDemo123')
        admin_user.save()
        admin_group, _ = Group.objects.get_or_create(name='admin')
        admin_user.groups.add(admin_group)
        login = self.client.post(
            '/api/v1/auth/local-login/',
            {'phone_digits': '998901110001', 'password': 'AdminDemo123'},
            format='json',
        )
        self.assertEqual(login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.json()["access"]}')

        create = self.client.post(
            '/api/v1/admin/clinical-groups/',
            {'name': 'Test klinika', 'phone': '+998901234567'},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.content)
        clinic_id = create.json()['id']
        self.assertEqual(create.json()['name'], 'Test klinika')

        listing = self.client.get('/api/v1/admin/clinical-groups/')
        self.assertEqual(listing.status_code, 200)
        listing_items = listing.json().get('results', listing.json())
        self.assertEqual(len(listing_items), 1)

        detail = self.client.get(f'/api/v1/admin/clinical-groups/{clinic_id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['id'], clinic_id)

    def test_content_catalog_pagination(self):
        from datetime import timedelta

        from core.models import PreparedContent

        Group.objects.get_or_create(name='hodim')
        access = self._register_hodim('998901113366')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        for i in range(3):
            obj = PreparedContent.objects.create(
                owner_key='998901113366',
                kind=PreparedContent.KIND_CASE,
                topic=f'Eski keys {i}',
                topic_norm=f'eski keys {i}',
                author_display_name='Pager',
                subject_name='Anatomiya',
                subject_code='ANAT',
                payload={'topic': f'Eski keys {i}', 'questions': [{'scenario': 's', 'answer': 'a'}]},
            )
            PreparedContent.objects.filter(pk=obj.pk).update(
                created_at=timezone.now() - timedelta(hours=2)
            )

        page1 = self.client.get('/api/v1/content-catalog/?page=1&page_size=2')
        self.assertEqual(page1.status_code, 200)
        body = page1.json()
        self.assertEqual(body['count'], 3)
        self.assertEqual(body['page'], 1)
        self.assertEqual(body['page_size'], 2)
        self.assertEqual(len(body['results']), 2)

        page2 = self.client.get('/api/v1/content-catalog/?page=2&page_size=2')
        self.assertEqual(len(page2.json()['results']), 1)

    def test_education_ai_rate_limit(self):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory, force_authenticate

        from core.education_ai_views import EducationAiCompletionView
        from core.throttling import EducationAiUserThrottle

        user = User.objects.create_user(username='998901112255', password='StrongPass123')
        factory = APIRequestFactory()
        wsgi_request = factory.post('/api/v1/education-ai/completion/')
        force_authenticate(wsgi_request, user=user)
        request = Request(wsgi_request)
        view = EducationAiCompletionView()

        throttle = EducationAiUserThrottle()
        throttle.rate = '2/minute'
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        cache.clear()

        self.assertTrue(throttle.allow_request(request, view))
        self.assertTrue(throttle.allow_request(request, view))
        self.assertFalse(throttle.allow_request(request, view))

    @override_settings(ALLOW_OPEN_REGISTRATION=False)
    def test_open_registration_disabled(self):
        resp = self.client.post(
            '/api/v1/auth/local-login/',
            {
                'phone_digits': '998901112266',
                'password': 'StrongPass123',
                'role': 'hodim',
                'register': True,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(User.objects.filter(username='998901112266').exists())

    def test_admin_endpoint_requires_db_admin_group(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        Group.objects.get_or_create(name='hodim')
        user = User.objects.create_user(username='998901113333', password='StrongPass123')
        hodim_group, _ = Group.objects.get_or_create(name='hodim')
        user.groups.add(hodim_group)
        refresh = RefreshToken.for_user(user)
        refresh['role'] = 'admin'
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        resp = self.client.get('/api/v1/admin/clinical-groups/')
        self.assertEqual(resp.status_code, 403)

    def test_live_test_duplicate_participant_is_idempotent(self):
        access = self._register_hodim('998901112244')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        q = {
            'question': 'Q?',
            'options': ['A', 'B', 'C', 'D', 'E'],
            'correctOptionIndex': 0,
            'explanation': 'x',
        }
        up = self.client.post(
            '/api/v1/live-tests/',
            {'topic': 'Dup test', 'questions': [q]},
            format='json',
        )
        session_key = up.json()['session_key']
        self.client.credentials()
        payload = {
            'participant_key': 'student-abc',
            'first_name': 'Ali',
            'last_name': 'Valiyev',
            'answers': [0],
        }
        first = self.client.post(
            f'/api/v1/live-tests/{session_key}/submissions/',
            payload,
            format='json',
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            f'/api/v1/live-tests/{session_key}/submissions/',
            payload,
            format='json',
        )
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json().get('already_submitted'))


@override_settings(DEBUG=False, SECURE_SSL_REDIRECT=False)
class StaffCourseAssignmentPolicyTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        Group.objects.get_or_create(name='hodim')
        Group.objects.get_or_create(name='admin')
        self.hodim = User.objects.create_user(
            username='998901112233',
            password='TestHodim123',
            first_name='Test',
            last_name='Hodim',
        )
        self.hodim.groups.add(Group.objects.get(name='hodim'))
        from .models import CourseSyllabus, StaffCourseSelection

        self.syllabus = CourseSyllabus.objects.create(
            subject_name='Onkologiya',
            subject_code='onkologiya',
            variants=[
                {
                    'label': 'XT',
                    'file_name': 'Onkologiya(XT).pdf',
                    'topics': [{'id': 'M1', 'title': 'Mavzu 1', 'type': 'lecture'}],
                }
            ],
            topics=[{'id': 'M1', 'title': 'Mavzu 1', 'type': 'lecture'}],
        )
        StaffCourseSelection.objects.create(
            owner_key=self.hodim.username,
            syllabus=self.syllabus,
            variant_label='XT',
        )

    def _hodim_token(self) -> str:
        resp = self.client.post(
            '/api/v1/auth/local-login/',
            {'phone_digits': '998901112233', 'password': 'TestHodim123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        return resp.json()['access']

    def test_hodim_cannot_self_enroll_course(self) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._hodim_token()}')
        resp = self.client.post(
            '/api/v1/course-syllabuses/my/',
            {'syllabus_id': self.syllabus.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_hodim_cannot_remove_assigned_course(self) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._hodim_token()}')
        resp = self.client.delete(f'/api/v1/course-syllabuses/my/{self.syllabus.id}/')
        self.assertEqual(resp.status_code, 403)
        from .models import StaffCourseSelection

        self.assertTrue(
            StaffCourseSelection.objects.filter(
                owner_key=self.hodim.username,
                syllabus=self.syllabus,
            ).exists()
        )


@override_settings(DEBUG=False, SECURE_SSL_REDIRECT=False)
class EnsureDemoRoleUsersCommandTests(TestCase):
    def test_creates_demo_users_when_enabled(self) -> None:
        import os
        from io import StringIO

        from django.core.management import call_command

        prev = os.environ.get("DJANGO_ENSURE_DEMO_USERS")
        os.environ["DJANGO_ENSURE_DEMO_USERS"] = "True"
        try:
            out = StringIO()
            call_command("ensure_demo_role_users", stdout=out)
            self.assertIn("demo_admin", out.getvalue())
        finally:
            if prev is None:
                os.environ.pop("DJANGO_ENSURE_DEMO_USERS", None)
            else:
                os.environ["DJANGO_ENSURE_DEMO_USERS"] = prev

        admin = User.objects.get(username="998901110001")
        self.assertTrue(admin.check_password("AdminDemo123"))
        self.assertTrue(admin.groups.filter(name="admin").exists())

        hodim = User.objects.get(username="998901112233")
        self.assertTrue(hodim.check_password("TestHodim123"))
        self.assertTrue(hodim.groups.filter(name="hodim").exists())

    def test_skipped_when_disabled_in_prod(self) -> None:
        import os
        from io import StringIO

        from django.core.management import call_command

        prev = os.environ.get("DJANGO_ENSURE_DEMO_USERS")
        os.environ["DJANGO_ENSURE_DEMO_USERS"] = "False"
        try:
            out = StringIO()
            call_command("ensure_demo_role_users", stdout=out)
            self.assertIn("skipped", out.getvalue().lower())
        finally:
            if prev is None:
                os.environ.pop("DJANGO_ENSURE_DEMO_USERS", None)
            else:
                os.environ["DJANGO_ENSURE_DEMO_USERS"] = prev

        self.assertFalse(User.objects.filter(username="998901110001").exists())
