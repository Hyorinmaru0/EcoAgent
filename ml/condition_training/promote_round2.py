"""Install the evaluated binary condition model without replacing original weights."""
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'ml/condition_training'


def read(path):return json.loads(path.read_text(encoding='utf-8'))


def main():
    regression=read(ROOT/'reports/round2-binary-pipeline-regression.json')
    candidate=read(ROOT/'reports/round2-binary-candidate-fresh-pipeline.json')
    original=read(ROOT/'reports/round2-baseline-fresh-pipeline.json')
    if regression['passed']!=regression['total']:
        raise SystemExit('Do not activate: protected identity/condition regression failed.')
    def counts(report):
        positive=sum(c.get('damageStatus')=='damaged' and c.get('actualCategory')==c.get('expectedCategory') for c in report['cases'] if c['expectedDamaged'])
        false=sum(c.get('damageStatus')=='damaged' for c in report['cases'] if not c['expectedDamaged'])
        return positive,false
    new_positive,new_false=counts(candidate);old_positive,old_false=counts(original)
    if new_positive<=old_positive or new_false>old_false:
        raise SystemExit('Do not activate: detection did not improve without increasing false alarms.')
    source=BASE/'weights/round2-binary-candidate'
    destination=BASE/'weights/round2-binary-20261105'
    if destination.exists():raise SystemExit('Versioned installation already exists; refusing to overwrite it.')
    destination.mkdir(parents=True)
    hashes={}
    for name in ('best.pt','best.onnx','damage-policy.json'):
        shutil.copy2(source/name,destination/name)
        digest=hashlib.sha256((source/name).read_bytes()).hexdigest()
        if hashlib.sha256((destination/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Installed file hash mismatch')
        hashes[name]=digest
    env_path=ROOT/'.env'
    text=env_path.read_text(encoding='utf-8') if env_path.exists() else ''
    match=re.search(r'^DAMAGE_DETECTOR_WEIGHTS=(.*)$',text,re.M)
    previous=(match.group(1).strip() if match else '') or 'ml/damage_detection/weights/best.pt'
    target=(destination/'best.pt').relative_to(ROOT).as_posix()
    line='DAMAGE_DETECTOR_WEIGHTS='+target
    updated=re.sub(r'^DAMAGE_DETECTOR_WEIGHTS=.*$',line,text,flags=re.M) if match else text.rstrip()+'\n'+line+'\n'
    staging=ROOT/'.env.round2.tmp'
    staging.write_text(updated,encoding='utf-8')
    staging.replace(env_path)
    result=dict(active_weights=target,previous_weights=previous,hashes=hashes,
        original_weights_overwritten=False,mode='verified-device-crops',trained_classes=['visible_damage'],
        identity_classes_unchanged=['cell phone','laptop','television'],
        regression=dict(passed=regression['passed'],total=regression['total']),
        pipeline_comparison=dict(original_detected=old_positive,new_detected=new_positive,
            original_false_reports=old_false,new_false_reports=new_false),
        limitations=['Small development diagnostics; not universal accuracy.',
            'Device identity may abstain before condition assessment.',
            'Visible damage cannot establish electrical working/broken status.'])
    (ROOT/'reports/round2-activation.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(dict(active_weights=target,original_weights_preserved=True,pipeline_comparison=result['pipeline_comparison']),indent=2))


if __name__=='__main__':main()
