"""Explicit Sri Lanka place searches with bounded, cached provider requests."""
import math
import re
import time
import threading
import os
import unicodedata
from difflib import SequenceMatcher
from collections import OrderedDict
import requests
from fastapi import HTTPException

HEADERS = {'User-Agent': 'ConstructFlow/1.0 (construction project location search)'}
_cache = OrderedDict()
_cache_lock = threading.Lock()
_osm_lock = threading.Lock()
_osm_last = 0.0
_osm_cache = OrderedDict()


def nominatim_data(params, reverse=False):
    global _osm_last
    endpoint = os.getenv('NOMINATIM_REVERSE_URL' if reverse else 'NOMINATIM_SEARCH_URL', 'https://nominatim.openstreetmap.org/' + ('reverse' if reverse else 'search'))
    key = (endpoint, tuple(sorted((name, str(value)) for name, value in params.items())))
    with _osm_lock:
        cached = _osm_cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        delay = 1.05 - (time.monotonic() - _osm_last)
        if delay > 0:
            time.sleep(delay)
        _osm_last = time.monotonic()
        response = requests.get(endpoint, params=params, headers=HEADERS, timeout=5)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, (dict, list)):
            raise ValueError('Invalid location response')
        _osm_cache[key] = (time.monotonic() + 900, data)
        _osm_cache.move_to_end(key)
        while len(_osm_cache) > 256:
            _osm_cache.popitem(last=False)
        return data


def tokens(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    return [word for word in re.findall(r'[^\W_]+', text) if word not in {'in', 'near', 'sri', 'lanka'}]


def photon_rows(query):
    response = requests.get(os.getenv('PHOTON_SEARCH_URL', 'https://photon.komoot.io/api/'), params={'q': query, 'limit': 15, 'bbox': '79.5,5.8,82.1,10.0', 'lat': 7.8731, 'lon': 80.7718}, headers=HEADERS, timeout=5)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict) or not isinstance(data.get('features'), list):
        raise ValueError('Invalid location search response')
    rows = []
    for feature in data['features']:
        if not isinstance(feature, dict):
            continue
        props = feature.get('properties') or {}
        coords = (feature.get('geometry') or {}).get('coordinates') or []
        if len(coords) < 2:
            continue
        parts = []
        for part in [props.get(field) for field in ['name', 'housenumber', 'street', 'district', 'city', 'county', 'state', 'country']]:
            if part and part not in parts:
                parts.append(str(part))
        kind = props.get('osm_value') or ''
        precision = 'area' if props.get('osm_key') == 'place' or kind in {'city','town','village','suburb','district','county','state'} else 'street' if props.get('osm_key') == 'highway' else 'place'
        rows.append({'lat': coords[1], 'lon': coords[0], 'name': props.get('name') or '', 'city': props.get('city') or props.get('town') or '', 'display_name': ', '.join(parts), 'country_code': props.get('countrycode'), 'source': 'OpenStreetMap / Photon', 'result_type': kind, 'precision': precision})
    return rows


def suggest_locations(query):
    """Photon supports autocomplete; never send keystroke traffic to Nominatim."""
    query = ' '.join(unicodedata.normalize('NFKC', query).split())
    if len(query) < 3:
        return []
    from core import geoapify_search
    if geoapify_search.configured():
        return geoapify_search.rows(query, suggestions=True)
    return cached_photon_results(query, prefix=True)


def cached_photon_results(query, prefix=False):
    key = ('photon', prefix, query.casefold())
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > time.monotonic():
            _cache.move_to_end(key)
            return cached[1]
    try:
        result = ranked_results(query, photon_rows(query), prefix=prefix, allow_fuzzy=True)[:8]
    except (requests.RequestException, ValueError, TypeError):
        raise HTTPException(503, 'Suggestions are temporarily unavailable. Press Search to try the full address search.')
    with _cache_lock:
        _cache[key] = (time.monotonic() + (180 if result else 30), result)
        _cache.move_to_end(key)
        while len(_cache) > 256:
            _cache.popitem(last=False)
    return result


def ranked_results(query, rows, prefix=False, allow_fuzzy=False):
    wanted = set(tokens(query))
    ranked = []
    for row in rows:
        try:
            lat, lon = float(row['lat']), float(row['lon'])
            if not math.isfinite(lat + lon) or not (5.8 <= lat <= 10 and 79.5 <= lon <= 82.1):
                continue
            if row.get('country_code') and row['country_code'].casefold() != 'lk':
                continue
            label = str(row.get('display_name') or '').strip()
            if not label:
                continue
            found = set(tokens(label + ' ' + str(row.get('match_alias') or '')))
            matched = sum(any(word == candidate or (prefix and candidate.startswith(word)) for candidate in found) for word in wanted)
            coverage = matched / max(1, len(wanted))
            compact = ''.join(tokens(query))
            joined_match = len(compact) >= 6 and compact in ''.join(tokens(label + ' ' + str(row.get('name') or '')))
            if joined_match:
                coverage = 1
            # A shared word such as 'Path', 'Mr' or a city is not a business match.
            if allow_fuzzy and len(wanted) > 1 and re.search(r'[a-zA-Z]', query) and coverage < .7:
                continue
            if allow_fuzzy and coverage == 0 and re.search(r'[a-zA-Z]', query):
                compact_name = ''.join(tokens(str(row.get('name') or label.split(',')[0])))
                brand_typo = len(wanted) == 1 and len(compact) >= 6 and SequenceMatcher(None, compact, compact_name[:len(compact)]).ratio() >= .8
                if not brand_typo and not any(len(word) >= 4 and SequenceMatcher(None, word, candidate).ratio() >= .78 for word in wanted for candidate in found):
                    continue
            if coverage == 0 and not allow_fuzzy:
                continue
            result = {**row, 'lat': lat, 'lon': lon, 'match_type': 'full' if coverage == 1 else 'partial'}
            city_match = bool(wanted & set(tokens(row.get('city') or '')))
            ranked.append((coverage + (0.05 if city_match else 0), result))
        except (KeyError, TypeError, ValueError):
            continue
    ranked.sort(key=lambda item: item[0], reverse=True)
    unique = []
    for _, row in ranked:
        if any(abs(row['lat'] - other['lat']) < .0003 and abs(row['lon'] - other['lon']) < .0003 and set(tokens(row.get('name') or row['display_name'].split(',')[0])) == set(tokens(other.get('name') or other['display_name'].split(',')[0])) for other in unique):
            continue
        unique.append(row)
    return unique[:10]


def search_locations(query):
    query = ' '.join(unicodedata.normalize('NFKC', query).split())
    if len(query) < 2:
        return []
    from core import geoapify_search
    if geoapify_search.configured():
        return geoapify_search.rows(query)
    key = query.casefold()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > time.monotonic():
            _cache.move_to_end(key)
            return cached[1]
    rows, successful = [], False
    try:
        rows.extend(photon_rows(query))
        successful = True
    except (requests.RequestException, ValueError, TypeError):
        pass
    try:
        # One application-wide Nominatim request at a time, at most once per second.
        # Only explicit searches reach this service; never use it for autocomplete.
        data = nominatim_data({'q': query, 'format': 'jsonv2', 'limit': 10, 'countrycodes': 'lk', 'addressdetails': 1, 'namedetails': 1, 'dedupe': 1})
        if isinstance(data, list):
            successful = True
            for item in data:
                if not isinstance(item, dict):
                    continue
                address = item.get('address') or {}
                rows.append({'lat': item.get('lat'), 'lon': item.get('lon'), 'name': item.get('name') or '', 'city': address.get('city') or address.get('town') or address.get('village') or '', 'display_name': item.get('display_name'), 'country_code': address.get('country_code'), 'source': 'OpenStreetMap / Nominatim'})
    except (requests.RequestException, ValueError, TypeError):
        pass
    if not successful:
        raise HTTPException(503, 'Location search is temporarily unavailable. Try again or pin the site on the map.')
    results = ranked_results(query, rows)
    with _cache_lock:
        _cache[key] = (time.monotonic() + (900 if results else 60), results)
        _cache.move_to_end(key)
        while len(_cache) > 256:
            _cache.popitem(last=False)
    return results
