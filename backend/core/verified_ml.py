"""Only independently verified, evaluated artifacts may serve ML predictions."""
import hashlib
import io
import json
import os
from functools import lru_cache
from pathlib import Path
import joblib


class ModelNotReady(ValueError):
    pass


def model_directory():
    return Path(os.environ.get('CONSTRUCTFLOW_MODEL_DIR', str(Path(__file__).resolve().parents[1] / 'models')))


def model_status(name, directory=None):
    directory = Path(directory) if directory else model_directory()
    artifact, metadata = directory / f'{name}.pkl', directory / f'{name}_meta.json'
    result = {'ready': False, 'reason': 'No verified trained model is available', 'training_projects': 0}
    try:
        meta = json.loads(metadata.read_text(encoding='utf-8'))
        result.update({'model_type': meta.get('model_type'), 'training_projects': meta.get('real_projects_count', 0),
                       'trained_at': meta.get('trained_at'), 'features': meta.get('features', []),
                       'validation_method': meta.get('evaluation_method'), 'metrics': meta.get('metrics', {})})
        if meta.get('data_provenance') != 'verified_real_only' or meta.get('synthetic_rows_included') is not False:
            result['reason'] = 'Existing artifact was not trained exclusively on verified real projects'
            result.update(trained_at=None,training_projects=0,features=[],model_type=None,metrics={})
        elif not meta.get('production_ready'):
            result['reason'] = meta.get('validation_status') or 'Held-out validation has not passed'
        elif not artifact.exists() or not meta.get('artifact_sha256') or hashlib.sha256(artifact.read_bytes()).hexdigest() != meta['artifact_sha256']:
            result['reason'] = 'Model artifact and metadata do not match; retraining is required'
        else:
            result.update(ready=True, reason='Verified model passed held-out validation')
    except (OSError, ValueError, TypeError):
        pass
    return result


@lru_cache(maxsize=4)
def _load(path, digest):
    payload = Path(path).read_bytes()
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ModelNotReady('Model changed while loading; retry after training completes')
    model = joblib.load(io.BytesIO(payload))
    for value in getattr(model, 'named_steps', {}).values():
        if hasattr(value, 'n_jobs'):
            value.n_jobs = 1
    return model


def load_verified_model(name, directory=None):
    directory = Path(directory) if directory else model_directory()
    state = model_status(name, directory)
    if not state['ready']:
        raise ModelNotReady(state['reason'])
    meta = json.loads((directory / f'{name}_meta.json').read_text(encoding='utf-8'))
    try:
        return _load(str(directory / f'{name}.pkl'), meta['artifact_sha256']), meta
    except ModelNotReady:
        raise
    except Exception as exc:
        raise ModelNotReady('Verified artifact is incompatible with this runtime; retrain using the deployed dependency versions') from exc
