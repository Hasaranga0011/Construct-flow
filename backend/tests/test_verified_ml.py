import json
from datetime import date, timedelta
import numpy as np
import pandas as pd
import pytest
from core.verified_ml import ModelNotReady, model_status, load_verified_model
from data_pipeline.verified_delay_training import FEATURES, validate_real_observations, train_verified_delay


def observation_fixture(n=20):
    # Artificial unit-test observations are confined to temporary test artifacts.
    planned=date(2024,6,1)
    return pd.DataFrame([{'project_id':f'fixture-{i}','observation_date':str(planned-timedelta(days=30)),
        'planned_completion_date':str(planned),'actual_completion_date':str(planned+timedelta(days=10 if i%2 else -1)),
        **{key:90 if i%2 else 10 for key in FEATURES},'verified':True,'verified_by':'fixture-reviewer',
        'imported_by':'fixture-importer','evidence_note':'Unit test only','source':'real_completed'} for i in range(n)])


@pytest.mark.parametrize('mutation', ['unverified','self_verified','synthetic','after_outcome','missing_feature','missing_dates'])
def test_delay_training_rejects_unreviewed_or_leaking_observations(mutation):
    data=observation_fixture()
    if mutation=='unverified':data.loc[0,'verified']=False
    if mutation=='self_verified':data.loc[0,'verified_by']='fixture-importer'
    if mutation=='synthetic':data.loc[0,'source']='synthetic'
    if mutation=='after_outcome':data.loc[0,'observation_date']='2025-01-01'
    if mutation=='missing_feature':data.loc[0,'labour']=np.nan
    if mutation=='missing_dates':data.loc[0,'actual_completion_date']=None
    with pytest.raises(ModelNotReady):validate_real_observations(data)


def test_trained_grouped_model_is_published_and_predicts_from_features(tmp_path):
    meta=train_verified_delay(observation_fixture(),tmp_path)
    assert meta['real_projects_count']==20
    assert meta['metrics']['roc_auc']>.5
    assert model_status('delay_classifier',tmp_path)['ready']
    model,manifest=load_verified_model('delay_classifier',tmp_path)
    low=model.predict_proba(pd.DataFrame([{key:10 for key in FEATURES}]))[0,1]
    high=model.predict_proba(pd.DataFrame([{key:90 for key in FEATURES}]))[0,1]
    assert high>low
    (tmp_path/'delay_classifier.pkl').write_bytes(b'changed')
    assert model_status('delay_classifier',tmp_path)['ready'] is False


def test_legacy_model_metadata_cannot_be_loaded_as_verified(tmp_path):
    (tmp_path/'cost_predictor.pkl').write_bytes(b'never deserialize')
    (tmp_path/'cost_predictor_meta.json').write_text(json.dumps({'real_projects_count':50000,'data_source':'synthetic_demo'}))
    with pytest.raises(ModelNotReady):load_verified_model('cost_predictor',tmp_path)


def test_zero_verified_cost_data_never_creates_a_bootstrap_model(monkeypatch,tmp_path):
    from data_pipeline import model_engine as engine
    monkeypatch.setattr(engine,'get_all_real_projects',lambda:[])
    monkeypatch.setattr(engine,'COST_MODEL_PKL',tmp_path/'cost_predictor.pkl')
    monkeypatch.setattr(engine,'_generate_parametric_bootstrap',lambda *a:pytest.fail('Synthetic rows must never be substituted'))
    with pytest.raises(ModelNotReady):engine.train_and_evaluate_cost_model()
    assert not (tmp_path/'cost_predictor.pkl').exists()


def test_verified_cost_training_and_inference_do_not_call_rate_prediction(monkeypatch,tmp_path):
    from data_pipeline import model_engine as engine
    rows=[]
    for i in range(6):
        area=1000+i*200
        rows.append({'project_name':f'Unit fixture {i}','district':'Colombo','project_type':'Residential House',
            'quality_tier':'Standard','floors':1,'structure_type':'RCC frame','site_condition':'Flat',
            'cost_year':2026,'floor_area_sqft':area,'actual_total_lkr':area*15000,'source':'real','verified':True})
    monkeypatch.setattr(engine,'get_all_real_projects',lambda:rows)
    monkeypatch.setattr(engine,'get_real_projects_count',lambda:len(rows))
    monkeypatch.setattr(engine,'COST_MODEL_PKL',tmp_path/'cost_predictor.pkl')
    monkeypatch.setattr(engine,'COST_META_JSON',tmp_path/'cost_predictor_meta.json')
    monkeypatch.setattr(engine,'_generate_parametric_bootstrap',lambda *a:pytest.fail('No synthetic data permitted'))
    meta=engine.train_and_evaluate_cost_model()
    assert meta['synthetic_rows_included'] is False and meta['data_provenance']=='verified_real_only'
    monkeypatch.setattr(engine,'compute_hybrid_bottom_up',lambda **kwargs:pytest.fail('No hardcoded rate fallback permitted'))
    result=engine.predict_cost_hybrid(1000,1,'Colombo','Residential House','Standard')
    assert result['model_source']=='verified_real_ml'
    assert result['estimated_cost_lkr']==pytest.approx(15000000,rel=.01)
    outside=engine.predict_cost_hybrid(50000,1,'Colombo','Residential House','Standard',cost_year=2026)
    assert any('floor area sqft' in warning for warning in outside['prediction_warnings'])
    assert outside['estimated_range_min_lkr'] is None


@pytest.mark.parametrize('conflict', ['dates','predictors'])
def test_delay_rejects_conflicting_project_snapshots(conflict):
    data=observation_fixture()
    duplicate=data.iloc[[0]].copy()
    if conflict=='dates':duplicate['actual_completion_date']='2024-05-30'
    else:duplicate['labour']=50
    with pytest.raises(ModelNotReady,match='consistent|Conflicting'):
        validate_real_observations(pd.concat([data,duplicate],ignore_index=True))
