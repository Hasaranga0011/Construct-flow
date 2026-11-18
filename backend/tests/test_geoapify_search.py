from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
import pytest
import requests
from fastapi import HTTPException
from core import geoapify_search as geo
from core import location_search


@pytest.fixture(autouse=True)
def isolated_geoapify(monkeypatch):
    monkeypatch.setattr(geo.settings, 'GEOAPIFY_API_KEY', 'fixture-private-provider-key')
    monkeypatch.setattr(geo.time, 'sleep', lambda seconds: None)
    geo._cache.clear()
    geo._last_request = 0
    monkeypatch.setattr(location_search, 'cached_photon_results', lambda *args, **kwargs: [])


def response(rows):
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'results': rows})


def test_autocomplete_uses_server_key_and_country_filter_without_fallback_calls(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append((url, kwargs))
        return response([{'lat': 7.2, 'lon': 79.8, 'name': 'Negombo', 'formatted': 'Negombo, Sri Lanka', 'country_code': 'lk', 'result_type': 'city'}])
    monkeypatch.setattr(geo.requests, 'get', get)
    rows = location_search.suggest_locations('Neg')
    assert rows[0]['source'] == 'Geoapify'
    assert rows[0]['result_type'] == 'city'
    assert 'fixture-private-provider-key' not in str(rows)
    assert calls[0][0] == 'https://api.geoapify.com/v1/geocode/autocomplete'
    assert calls[0][1]['params']['filter'] == 'countrycode:lk'
    assert calls[0][1]['params']['apiKey'] == 'fixture-private-provider-key'
    assert location_search.suggest_locations('Neg') == rows
    assert len(calls) == 1


def test_fuzzy_or_translated_provider_matches_are_not_discarded(monkeypatch):
    monkeypatch.setattr(geo.requests, 'get', lambda *args, **kwargs: response([{'lat': 7.2, 'lon': 79.8, 'formatted': 'Negombo, Sri Lanka', 'country_code': 'lk'}]))
    result = location_search.search_locations('මීගමුව')
    assert len(result) == 1
    assert result[0]['match_type'] == 'partial'


def test_foreign_or_invalid_provider_results_never_become_site_pins(monkeypatch):
    monkeypatch.setattr(geo.requests, 'get', lambda *args, **kwargs: response([{'lat': 0, 'lon': 0, 'formatted': 'Invalid'}, {'lat': 7.2, 'lon': 79.8, 'formatted': 'Wrong country', 'country_code': 'in'}, {'lat': None, 'lon': None, 'formatted': 'No coordinates'}]))
    assert geo.rows('Invalid') == []


def test_api_failures_do_not_expose_authenticated_urls_or_keys(monkeypatch):
    def fail(*args, **kwargs):
        raise requests.HTTPError('https://api.geoapify.com?apiKey=fixture-private-provider-key')
    monkeypatch.setattr(geo.requests, 'get', fail)
    with pytest.raises(HTTPException) as error:
        geo.rows('Negombo')
    assert error.value.status_code == 503
    assert 'apiKey' not in error.value.detail and 'fixture-private-provider-key' not in error.value.detail
    assert error.value.__suppress_context__
    assert not geo._cache


def test_concurrent_repeated_queries_share_one_quota_request(monkeypatch):
    calls = []
    def get(*args, **kwargs):
        calls.append(kwargs)
        Event().wait(.03)
        return response([])
    monkeypatch.setattr(geo.requests, 'get', get)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(lambda _: geo.rows('Same place', suggestions=True), range(2))) == [[], []]
    assert len(calls) == 1


def test_reverse_lookup_is_cached_and_returns_only_address_data(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        return response([{'formatted': 'QA Road, Negombo', 'apiKey': 'not-returned'}])
    monkeypatch.setattr(geo.requests, 'get', get)
    assert geo.reverse(7.21, 79.81) == {'display_name': 'QA Road, Negombo', 'source': 'Geoapify'}
    geo.reverse(7.21, 79.81)
    assert len(calls) == 1


def test_explicit_geoapify_configuration_takes_priority_without_exposing_keys(monkeypatch):
    from api.routes.maps import map_configuration
    monkeypatch.setattr(geo.settings, 'GOOGLE_MAPS_BROWSER_KEY', 'fixture-google-key')
    assert map_configuration() == {'provider': 'openstreetmap', 'search_provider': 'geoapify'}


def test_named_business_search_keeps_city_as_a_spatial_constraint(monkeypatch):
    calls = []
    def get(url, **kwargs):
        params = kwargs['params']; calls.append((url, params))
        if url.endswith('/places'):
            assert params['name'] == 'QA Office'
            assert params['filter'] == 'circle:79.8,7.2,20000'
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'features': [{'properties': {'name': 'QA Office', 'city': 'Negombo', 'country_code': 'lk', 'lat': 7.21, 'lon': 79.81, 'formatted': 'QA Office, Negombo'}}]})
        if params.get('type') == 'city':
            return response([{'city': 'Negombo', 'result_type': 'city', 'lat': 7.2, 'lon': 79.8}])
        return response([])
    monkeypatch.setattr(geo.requests, 'get', get)
    result = geo.rows('QA Office, Negombo')
    assert result[0]['precision'] == 'place'
    assert len(calls) == 3
    geo.rows('QA Office, Negombo')
    assert len(calls) == 3


def test_city_and_street_results_are_marked_as_approximate_areas(monkeypatch):
    monkeypatch.setattr(geo.requests, 'get', lambda *args, **kwargs: response([{'name': 'Negombo', 'country_code': 'lk', 'lat': 7.2, 'lon': 79.8, 'formatted': 'Negombo', 'result_type': 'city'}]))
    assert geo.rows('Negombo')[0]['precision'] == 'area'


def test_partial_address_match_does_not_hide_a_named_business(monkeypatch):
    monkeypatch.setattr(geo, 'data', lambda *args, **kwargs: [{'formatted':'Negombo Beach', 'name':'Beach', 'city':'Negombo', 'lat':7.2,'lon':79.8,'country_code':'lk'}])
    calls=[]
    def places(query):
        calls.append(query)
        return [{'formatted':'QA Hotel, Negombo', 'name':'QA Hotel', 'city':'Negombo', 'lat':7.21,'lon':79.81,'country_code':'lk','result_type':'amenity'}]
    monkeypatch.setattr(geo,'business_rows',places)
    assert geo.rows('QA Hotel Negombo')[0]['name']=='QA Hotel'
    assert calls==['QA Hotel Negombo']


def test_empty_geoapify_uses_key_free_typo_fallback(monkeypatch):
    monkeypatch.setattr(geo.requests,'get',lambda *args,**kwargs:response([]))
    calls=[]
    def fallback(query,prefix=False):
        calls.append((query,prefix))
        return [{'lat':6.93,'lon':79.84,'name':'Shangri-La Hotel Colombo','source':'OpenStreetMap / Photon'}]
    monkeypatch.setattr(location_search,'cached_photon_results',fallback)
    assert geo.rows('shrangila',suggestions=True)[0]['name']=='Shangri-La Hotel Colombo'
    assert calls==[('shrangila',True)]
