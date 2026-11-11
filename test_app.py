"""Offline regressions for dependency migrations; no Google credentials required."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import main


class AppCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.credentials = patch.object(main.ee, 'ServiceAccountCredentials', return_value=object())
        self.initialize = patch.object(main.ee, 'Initialize')
        self.credentials.start()
        self.initialize_mock = self.initialize.start()
        main.EE_CREDENTIALS = None
        self.client = main.app.test_client()
        main.app.config['TESTING'] = True

    def tearDown(self):
        self.credentials.stop()
        self.initialize.stop()
        main.EE_CREDENTIALS = None

    def test_all_map_pages_use_cloud_tile_urls(self):
        tile_url = '/tiles/projects/test/maps/test/{z}/{x}/{y}'
        map_response = {'mapid': 'projects/test/maps/test', 'tile_fetcher': SimpleNamespace(url_format=tile_url)}
        with patch.object(main, 'GetMapFromId', return_value=map_response):
            for route in ['/'] + ['/map/' + str(i) for i in range(7)]:
                with self.subTest(route=route):
                    response = self.client.get(route)
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(tile_url, response.get_data(as_text=True))
                    self.assertIn('ESP', response.get_data(as_text=True))
        self.initialize_mock.assert_called_with(main.EE_CREDENTIALS, project=main.config.PROJECT_ID)

    def test_country_and_static_assets(self):
        response = self.client.get('/country/ESP')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Spain', response.get_data(as_text=True))
        for route in ['/static/js/maps.js', '/static/css/styles.css', '/static/countries/ESP.geo.json']:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                response.close()

    def test_details_response_shapes(self):
        for map_id, data, expected in [('0', {'elevation': 100}, {'elevation': 100}), ('3', {'histogram': [1]}, {'histogram': [1]}), ('5', [1, 2, 3], {'forestChange': [1, 2, 3]}), ('6', iter([[123, 0.5]]), {'timeSeries': [[123, 0.5]]})]:
            with self.subTest(map_id=map_id), patch.object(main, 'ComputeCountryTimeSeries', return_value=data):
                response = self.client.get('/details/' + map_id + '/ESP')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(json.loads(response.data), expected)

    def test_custom_polygon_response_and_ee_error(self):
        polygon = json.dumps({'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [0, 0]]]})
        with patch.object(main, 'coordsToFeature', return_value=object()), patch.object(main, 'ComputeCountryTimeSeries', return_value={'elevation': 10}):
            response = self.client.post('/custom/0/4', data={polygon: ''})
            self.assertEqual(json.loads(response.data), {'elevation': 10})
        with patch.object(main, 'ComputeCountryTimeSeries', side_effect=main.ee.EEException('Unavailable')):
            response = self.client.get('/details/0/ESP')
            self.assertEqual(json.loads(response.data), {'error': 'Unavailable'})

    def test_authenticated_tile_proxy_and_cache(self):
        with patch.object(main.config, 'PROJECT_ID', 'test'), patch.object(main.ee.data, 'TileFetcher') as fetcher:
            fetcher.return_value.fetch_tile.return_value = b'png-tile'
            response = self.client.get('/tiles/projects/test/maps/opaque/5/-1/4')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b'png-tile')
            self.assertEqual(response.content_type, 'image/png')
            self.assertEqual(response.headers['Cache-Control'], 'public, max-age=3600')
            fetcher.assert_called_once_with('', map_name='projects/test/maps/opaque')
            fetcher.return_value.fetch_tile.assert_called_once_with(31, 4, 5)

    def test_tile_proxy_rejects_other_projects_and_invalid_coordinates(self):
        with patch.object(main.config, 'PROJECT_ID', 'test'), patch.object(main.ee.data, 'TileFetcher') as fetcher:
            for route, status in [('/tiles/projects/other/maps/opaque/5/1/4', 404), ('/tiles/projects/test/maps/opaque/31/1/4', 400), ('/tiles/projects/test/maps/opaque/0/1/4', 400)]:
                with self.subTest(route=route):
                    self.assertEqual(self.client.get(route).status_code, status)
            fetcher.assert_not_called()

    def test_tile_proxy_errors_do_not_expose_credentials(self):
        with patch.object(main.config, 'PROJECT_ID', 'test'), patch.object(main.ee.data, 'TileFetcher') as fetcher:
            fetcher.return_value.fetch_tile.side_effect = main.ee.EEException('secret failure detail')
            response = self.client.get('/tiles/projects/test/maps/opaque/5/1/4')
            self.assertEqual(response.status_code, 502)
            self.assertNotIn(b'secret failure detail', response.data)
            self.assertNotIn('Cache-Control', response.headers)

    def test_cache_serialization(self):
        value, flags = main.json_serializer('key', {'value': 1})
        self.assertEqual(main.json_deserializer('key', value, flags), {'value': 1})


if __name__ == '__main__':
    unittest.main()
