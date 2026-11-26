"""Train on reviewed pre-outcome observations, grouped by real project identity."""
import hashlib
import io
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import balanced_accuracy_score, roc_auc_score, brier_score_loss
from sklearn.model_selection import StratifiedGroupKFold
from core.verified_ml import ModelNotReady, model_directory

FEATURES = ['schedule_slip', 'overdue_milestones', 'procurement', 'cost', 'labour']
REQUIRED = FEATURES + ['project_id', 'observation_date', 'planned_completion_date', 'actual_completion_date',
                       'verified', 'verified_by', 'imported_by', 'evidence_note', 'source']


def validate_real_observations(frame):
    missing = sorted(set(REQUIRED)-set(frame.columns))
    if missing:
        raise ModelNotReady('Verified delay data needs columns: ' + ', '.join(missing))
    frame = frame.copy()
    if not frame.verified.astype(str).str.lower().isin(['true','1']).all():
        raise ModelNotReady('Every delay observation must be independently verified')
    if not frame.source.isin(['real', 'real_completed', 'imported_boq']).all():
        raise ModelNotReady('Unverified/synthetic sources cannot train a production model')
    for key in ['project_id','verified_by','imported_by','evidence_note']:
        if frame[key].isna().any() or frame[key].astype(str).str.strip().eq('').any():
            raise ModelNotReady(f'Delay data requires {key}')
        frame[key] = frame[key].astype(str).str.strip()
    if (frame.verified_by.str.lower() == frame.imported_by.str.lower()).any():
        raise ModelNotReady('Importer cannot verify their own delay evidence')
    for key in ['observation_date','planned_completion_date','actual_completion_date']:
        frame[key] = pd.to_datetime(frame[key], errors='coerce', utc=True)
        if frame[key].isna().any():
            raise ModelNotReady('Delay observations require valid planned and actual completion dates')
    if ((frame.observation_date >= frame.planned_completion_date) | (frame.observation_date >= frame.actual_completion_date)).any():
        raise ModelNotReady('Predictor observations must precede planned and actual completion; post-outcome data leaks the answer')
    for key in FEATURES:
        frame[key] = pd.to_numeric(frame[key], errors='coerce')
        if not np.isfinite(frame[key]).all() or not frame[key].between(0,100).all():
            raise ModelNotReady('All five recorded risk features must be finite values between 0 and 100')
    frame['delayed'] = (frame.actual_completion_date > frame.planned_completion_date).astype(int)
    if frame.groupby('project_id').delayed.nunique().max() != 1:
        raise ModelNotReady('A project cannot have conflicting final delay outcomes')
    for key in ['planned_completion_date', 'actual_completion_date']:
        if (frame.groupby('project_id')[key].nunique() > 1).any():
            raise ModelNotReady('A project must have one consistent planned and actual completion date')
    if (frame.groupby(['project_id', 'observation_date'])[FEATURES].nunique() > 1).any().any():
        raise ModelNotReady('Conflicting predictor values for the same project and observation date')
    return frame.drop_duplicates(['project_id','observation_date'])


def publish(directory, name, model, meta):
    directory = Path(directory); directory.mkdir(parents=True,exist_ok=True)
    stream=io.BytesIO();joblib.dump(model,stream,compress=3);payload=stream.getvalue()
    meta['artifact_sha256']=hashlib.sha256(payload).hexdigest()
    for filename,content in [(name+'.pkl',payload),(name+'_meta.json',json.dumps(meta,indent=2).encode())]:
        temporary=None
        try:
            with tempfile.NamedTemporaryFile(dir=directory,delete=False) as output:
                temporary=output.name;output.write(content);output.flush();os.fsync(output.fileno())
            os.replace(temporary,directory/filename)
        finally:
            if temporary and os.path.exists(temporary):os.unlink(temporary)


def train_verified_delay(frame, directory=None):
    frame=validate_real_observations(frame)
    projects=frame.drop_duplicates('project_id')
    counts=projects.delayed.value_counts()
    if len(counts)!=2 or counts.min()<2:
        raise ModelNotReady('Delay training requires independently verified delayed and on-time projects, at least two of each for grouped evaluation')
    splitter=StratifiedGroupKFold(n_splits=min(5,int(counts.min())),shuffle=True,random_state=42)
    predicted=np.full(len(frame),np.nan)
    for train,test in splitter.split(frame[FEATURES],frame.delayed,groups=frame.project_id):
        model=RandomForestClassifier(n_estimators=100,max_depth=8,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=1)
        training = frame.iloc[train]
        weights = 1 / training.groupby('project_id')['project_id'].transform('size')
        model.fit(training[FEATURES],training.delayed,sample_weight=weights.to_numpy())
        if set(model.classes_)!={0,1}:raise ModelNotReady('Grouped folds need both outcome classes; provide more real projects')
        predicted[test]=model.predict_proba(frame.iloc[test][FEATURES])[:,list(model.classes_).index(1)]
    # Score once per held-out project so projects with many snapshots do not dominate.
    evaluated=pd.DataFrame({'project_id':frame.project_id.to_numpy(),'actual':frame.delayed.to_numpy(),'predicted':predicted}).groupby('project_id').agg(actual=('actual','first'),predicted=('predicted','mean'))
    auc=float(roc_auc_score(evaluated.actual,evaluated.predicted))
    balanced=float(balanced_accuracy_score(evaluated.actual,evaluated.predicted>=.5))
    if auc<=.5 or balanced<=.5:
        raise ModelNotReady('Real delay model did not beat the no-skill baseline on held-out projects; previous artifact is preserved')
    model=RandomForestClassifier(n_estimators=100,max_depth=8,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=1)
    weights = 1 / frame.groupby('project_id')['project_id'].transform('size')
    model.fit(frame[FEATURES],frame.delayed,sample_weight=weights.to_numpy())
    meta={'model_type':'RandomForestClassifier','trained_at':datetime.now(timezone.utc).isoformat(),
        'real_projects_count':len(projects),'total_training_samples':len(frame),'features':FEATURES,
        'data_provenance':'verified_real_only','synthetic_rows_included':False,'production_ready':True,
        'evaluation_method':'Stratified grouped cross-validation by project',
        'metrics':{'roc_auc':auc,'balanced_accuracy':balanced,'baseline_balanced_accuracy':.5,
                   'brier_score':float(brier_score_loss(evaluated.actual,evaluated.predicted))},
        'project_balanced_training':True,
        'feature_importances':[{'key':key,'value':round(float(value)*100,2)} for key,value in zip(FEATURES,model.feature_importances_)],
        'validation_status':'Passed held-out project evaluation; probability calibration is not established'}
    publish(directory or model_directory(),'delay_classifier',model,meta)
    return meta
