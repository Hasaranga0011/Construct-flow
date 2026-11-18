"""Server-only Geoapify address search. Never log authenticated URLs or exceptions."""
import threading
import time
from collections import OrderedDict
import requests
from fastapi import HTTPException
from core.config import settings

_lock = threading.Lock()
_cache = OrderedDict()
_last_request = 0.0


def configured():
    return bool(settings.GEOAPIFY_API_KEY.strip())


def data(endpoint, params):
    global _last_request
    cache_key = (endpoint, tuple(sorted((name, str(value)) for name, value in params.items())))
    # Coalesce identical concurrent requests and stay below the free provider rate limit.
    with _lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            _cache.move_to_end(cache_key)
            return cached[1]
        delay = .26 - (time.monotonic() - _last_request)
        if delay > 0:
            time.sleep(delay)
        _last_request = time.monotonic()
        try:
            url = 'https://api.geoapify.com/v2/places' if endpoint == 'places' else 'https://api.geoapify.com/v1/geocode/' + endpoint
            response = requests.get(url, params={**params, 'apiKey': settings.GEOAPIFY_API_KEY}, timeout=4)
            response.raise_for_status()
            value = response.json()
            result_key = 'features' if endpoint == 'places' else 'results'
            if not isinstance(value, dict) or not isinstance(value.get(result_key), list):
                raise ValueError('Invalid provider data')
            results = [item.get('properties', {}) for item in value['features'] if isinstance(item, dict)] if endpoint == 'places' else value['results']
        except (requests.RequestException, ValueError, TypeError):
            raise HTTPException(503, 'Location search is temporarily unavailable. Try again or pin the site manually.') from None
        _cache[cache_key] = (time.monotonic() + (900 if results else 60), results)
        _cache.move_to_end(cache_key)
        while len(_cache) > 256:
            _cache.popitem(last=False)
        return results


def rows(query, suggestions=False):
    records = data('autocomplete' if suggestions else 'search', {'text': query, 'filter': 'countrycode:lk', 'format': 'json', 'limit': 8 if suggestions else 10})
    from core.location_search import ranked_results, tokens
    # Full search also checks named businesses. Keep typing suggestions inexpensive.
    wanted = set(tokens(query))
    full_match = any(wanted.issubset(set(tokens(str(item.get('name', '')) + ' ' + str(item.get('formatted', ''))))) for item in records if isinstance(item, dict))
    if not suggestions and not full_match and len(query.split()) >= 2:
        records = business_rows(query) + records
    normalized = []
    for item in records:
        if not isinstance(item, dict):
            continue
        normalized.append({'lat': item.get('lat'), 'lon': item.get('lon'), 'name': item.get('name') or item.get('address_line1') or '', 'city': item.get('city') or item.get('town') or '', 'display_name': item.get('formatted') or ', '.join(str(item[key]) for key in ['address_line1', 'address_line2'] if item.get(key)), 'country_code': item.get('country_code'), 'source': 'Geoapify', 'result_type': item.get('result_type'), 'precision': 'area' if item.get('result_type') in {'city','state','country','county','postcode','district','suburb','locality'} else 'street' if item.get('result_type') == 'street' else 'place'})
    for target, source in zip(normalized, [item for item in records if isinstance(item, dict)]):
        if source.get('match_alias'):
            target['match_alias'] = source['match_alias']
    results = ranked_results(query, normalized, prefix=suggestions, allow_fuzzy=True)
    if not results:
        from core.location_search import cached_photon_results
        try:
            return cached_photon_results(query, prefix=suggestions)
        except HTTPException:
            pass
    return results


def business_rows(query):
    name = query
    spatial_filter = 'rect:79.5,5.8,82.1,10.0'
    # A city suffix constrains the business search; it is never silently discarded.
    before, separator, city = query.rpartition(',')
    if not separator:
        before, separator, city = query.rpartition(' ')
    if before.strip() and city.strip():
        areas = data('search', {'text': city.strip(), 'type': 'city', 'filter': 'countrycode:lk', 'format': 'json', 'limit': 1})
        from core.location_search import tokens
        if areas and areas[0].get('result_type') == 'city' and set(tokens(city)) == set(tokens(areas[0].get('city') or areas[0].get('name') or '')):
            area = areas[0]
            name = before.strip()
            spatial_filter = f"circle:{float(area['lon'])},{float(area['lat'])},20000"
    from core.location_search import tokens
    variants = [name]
    words = name.split()
    if words and words[0].casefold() == 'ati':
        variants.append(' '.join(['Advanced Technological Institute', *words[1:]]))
    if words and words[0].casefold() == 'mr':
        variants.append(' '.join(['Mr.', *words[1:]]))
    if len(words) > 1:
        variants.append(''.join(words))
    for variant in list(dict.fromkeys(variants))[:3]:
        records = data('places', {'name': variant, 'categories': 'office,commercial,service,catering,accommodation,education,healthcare,tourism,leisure', 'filter': spatial_filter, 'limit': 20})
        wanted = set(tokens(variant))
        selected = [item for item in records if wanted.issubset(set(tokens(item.get('name') or ''))) or (len(''.join(tokens(variant))) >= 6 and ''.join(tokens(variant)) in ''.join(tokens(item.get('name') or '')))]
        if selected:
            return [{**item, 'result_type': 'amenity', **({'match_alias': name} if variant.startswith('Advanced Technological Institute') else {})} for item in selected]
    return []


def reverse(lat, lon):
    records = data('reverse', {'lat': round(lat, 6), 'lon': round(lon, 6), 'format': 'json', 'limit': 1})
    if records and records[0].get('formatted'):
        return {'display_name': records[0]['formatted'], 'source': 'Geoapify'}
    return {'display_name': f'Lat: {lat:.5f}, Lng: {lon:.5f}', 'source': 'Geoapify'}
