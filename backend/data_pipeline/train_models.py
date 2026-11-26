"""Offline verified-data training. Never seed or substitute random CSV data."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pandas as pd
from core.verified_ml import ModelNotReady
from data_pipeline.model_engine import train_and_evaluate_cost_model
from data_pipeline.verified_delay_training import train_verified_delay


def main():
    parser=argparse.ArgumentParser(description='Train cost and delay models exclusively on independently reviewed real project evidence')
    parser.add_argument('--delay-csv',type=Path,help='Verified pre-outcome delay observations with planned/actual completion dates')
    args=parser.parse_args()
    report={}
    try:
        meta=train_and_evaluate_cost_model()
        report['cost']={'state':'trained','projects':meta['real_projects_count'],'evaluation':meta['validation_status']}
    except ModelNotReady as exc:
        report['cost']={'state':'blocked','reason':str(exc)}
    except Exception as exc:
        report['cost']={'state':'error','reason':f'Could not read or train verified cost data ({type(exc).__name__})'}
    if args.delay_csv:
        try:
            meta=train_verified_delay(pd.read_csv(args.delay_csv))
            report['delay']={'state':'trained','projects':meta['real_projects_count'],'metrics':meta['metrics']}
        except ModelNotReady as exc:
            report['delay']={'state':'blocked','reason':str(exc)}
        except (OSError,ValueError) as exc:
            report['delay']={'state':'error','reason':f'Could not read reviewed delay observations ({type(exc).__name__})'}
    else:
        report['delay']={'state':'blocked','reason':'Supply --delay-csv with independently verified, pre-outcome observations; legacy unverified CSVs are never used'}
    print(json.dumps(report,indent=2))
    return 0 if all(row['state']=='trained' for row in report.values()) else 2


if __name__=='__main__':
    raise SystemExit(main())
