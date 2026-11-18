from types import SimpleNamespace
import pytest
import requests
from fastapi import HTTPException
from core import location_search as search


@pytest.fixture(autouse=True)
def isolated_search(monkeypatch):
    search._cache.clear()
    search._osm_cache.clear()
    search._osm_last = 0
    monkeypatch.setattr(search.time, 'sleep', lambda seconds: None)
    monkeypatch.delenv('PHOTON_SEARCH_URL', raising=False)
    monkeypatch.delenv('NOMINATIM_SEARCH_URL', raising=False)


def response(data):
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: data)


def test_exact_name_and_city_rank_before_generic_city_and_duplicates_are_merged():
    rows = [
        {'lat': 7.2, 'lon': 79.8, 'display_name': 'Negombo, Sri Lanka'},
        {'lat': 7.21, 'lon': 79.81, 'display_name': 'Enrich Arcane, Negombo, Sri Lanka'},
        {'lat': 7.21001, 'lon': 79.81001, 'display_name': 'Enrich Arcane, Negombo, Western Province, Sri Lanka'},
        {'lat': 7.3, 'lon': 79.9, 'display_name': 'Enrich Arcane, Colombo, Sri Lanka'},
    ]
    result = search.ranked_results('Enrich Arcane Negombo', rows)
    assert len(result) == 3
    assert result[0]['match_type'] == 'full'
    assert result[0]['display_name'] == rows[1]['display_name']
    assert all(row['match_type'] == 'partial' for row in result[1:])


def test_foreign_invalid_and_unrelated_coordinates_are_discarded():
    rows = [{'lat': lat, 'lon': lon, 'display_name': 'Negombo'} for lat, lon in [(0, 0), ('NaN', 80), (7, 'Infinity'), (51, 0), (None, 80)]]
    rows += [{'lat': 7.1, 'lon': 80, 'display_name': 'Negombo', 'country_code': 'in'}, {'lat': 7.1, 'lon': 80, 'display_name': 'Unrelated city'}]
    assert search.ranked_results('Negombo', rows) == []


def test_providers_keep_full_query_and_merge_results_with_sri_lanka_filters(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append((url, kwargs))
        if 'photon' in url:
            return response({'features': [{'geometry': {'coordinates': [79.81, 7.21]}, 'properties': {'name': 'Negombo', 'countrycode': 'LK'}}]})
        return response([{'lat': '7.22', 'lon': '79.82', 'name': 'Enrich Arcane', 'display_name': 'Enrich Arcane, Negombo, Sri Lanka', 'address': {'country_code': 'lk'}}])
    monkeypatch.setattr(search.requests, 'get', get)
    result = search.search_locations('  Enrich   Arcane Negombo ')
    assert result[0]['name'] == 'Enrich Arcane'
    assert all(call[1]['params']['q'] == 'Enrich Arcane Negombo' for call in calls)
    assert calls[0][1]['params']['bbox'] == '79.5,5.8,82.1,10.0'
    assert calls[1][1]['params']['countrycodes'] == 'lk'
    assert calls[1][1]['headers']['User-Agent'].startswith('ConstructFlow/')
    assert search.search_locations('enrich arcane negombo') == result
    assert len(calls) == 2


def test_total_outage_is_distinct_from_no_matching_place(monkeypatch):
    monkeypatch.setattr(search.requests, 'get', lambda *args, **kwargs: (_ for _ in ()).throw(requests.Timeout()))
    with pytest.raises(HTTPException) as error:
        search.search_locations('Enrich Arcane Negombo')
    assert error.value.status_code == 503
    assert not search._cache


def test_missing_place_does_not_drop_city_or_retry_individual_words(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(kwargs['params']['q'])
        return response({'features': []} if 'photon' in url else [])
    monkeypatch.setattr(search.requests, 'get', get)
    assert search.search_locations('Enrich Arcane Negombo') == []
    assert calls == ['Enrich Arcane Negombo', 'Enrich Arcane Negombo']
    assert search.search_locations('Enrich Arcane Negombo') == []
    assert len(calls) == 2


def test_nominatim_requests_are_globally_spaced(monkeypatch):
    waits = []
    monkeypatch.setattr(search.time, 'monotonic', lambda: 10.0)
    monkeypatch.setattr(search.time, 'sleep', waits.append)
    monkeypatch.setattr(search.requests, 'get', lambda url, **kwargs: response({'features': []} if 'photon' in url else []))
    search.search_locations('First place')
    search.search_locations('Second place')
    assert waits == [1.05]


def test_limit_and_country_filter_apply_to_every_result():
    rows = [{'lat': 7 + index / 100, 'lon': 80, 'display_name': f'Negombo place {index}'} for index in range(20)]
    assert len(search.ranked_results('Negombo', rows)) == 10


def test_city_context_breaks_ties_with_a_similarly_named_road():
    wrong = {'lat': 7.1, 'lon': 80, 'display_name': 'Office, Negombo Road, Colombo', 'city': 'Colombo'}
    correct = {'lat': 7.2, 'lon': 79.8, 'display_name': 'Office, Negombo', 'city': 'Negombo'}
    assert search.ranked_results('Office Negombo', [wrong, correct])[0]['city'] == 'Negombo'


def test_forward_and_reverse_share_throttle_and_reverse_cache(monkeypatch):
    calls, waits = [], []
    monkeypatch.setattr(search.time, 'monotonic', lambda: 10.0)
    monkeypatch.setattr(search.time, 'sleep', waits.append)
    def get(url, **kwargs):
        calls.append(url)
        return response({'display_name': 'Negombo'} if url.endswith('/reverse') else [])
    monkeypatch.setattr(search.requests, 'get', get)
    search.nominatim_data({'q': 'Negombo'})
    search.nominatim_data({'lat': 7.2, 'lon': 79.8}, reverse=True)
    search.nominatim_data({'lat': 7.2, 'lon': 79.8}, reverse=True)
    assert len(calls) == 2
    assert waits == [1.05]


def test_typing_suggestions_accept_prefixes_and_never_call_nominatim(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append((url, kwargs['params']))
        assert 'nominatim' not in url
        return response({'features': [{'geometry': {'coordinates': [79.8, 7.2]}, 'properties': {'name': 'Negombo', 'countrycode': 'LK'}}]})
    monkeypatch.setattr(search.requests, 'get', get)
    assert search.suggest_locations('Ne') == []
    result = search.suggest_locations('Neg')
    assert result[0]['name'] == 'Negombo'
    assert search.suggest_locations(' NEG ') == result
    assert len(calls) == 1
    assert calls[0][1]['bbox'] == '79.5,5.8,82.1,10.0'


def test_autocomplete_failure_never_falls_back_to_public_nominatim(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        raise requests.Timeout()
    monkeypatch.setattr(search.requests, 'get', get)
    with pytest.raises(HTTPException) as error:
        search.suggest_locations('Negombo')
    assert error.value.status_code == 503
    assert len(calls) == 1 and 'photon' in calls[0]


@pytest.mark.parametrize('query,label', [('Think Path','Path, Sri Lanka'),('Mr Kottu','MR College, Sri Lanka'),('ATI Galle','Galle Face Hotel, Colombo'),('ThinkPath','Path, Sri Lanka')])
def test_unrelated_shared_words_are_not_presented_as_business_matches(query,label):
    assert search.ranked_results(query,[{'lat':7.2,'lon':79.8,'display_name':label}],allow_fuzzy=True)==[]


def test_compound_business_names_and_minor_city_typos_are_retained():
    assert search.ranked_results('Think Path',[{'lat':7.2,'lon':79.8,'display_name':'ThinkPath, Galle'}],allow_fuzzy=True)
    assert search.ranked_results('ThinkPath',[{'lat':7.2,'lon':79.8,'display_name':'Think Path, Galle'}],allow_fuzzy=True)
    assert search.ranked_results('Negomob',[{'lat':7.2,'lon':79.8,'display_name':'Negombo, Sri Lanka'}],allow_fuzzy=True)


def test_transposed_compound_hotel_name_is_a_partial_match_not_a_guess():
    rows=search.ranked_results('shrangila',[{'lat':6.93,'lon':79.84,'name':'Shangri-La Hotel Colombo','display_name':'Shangri-La Hotel Colombo, Colombo 02, Sri Lanka'}],prefix=True,allow_fuzzy=True)
    assert len(rows)==1 and rows[0]['match_type']=='partial'
