import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('observe',Path(__file__).with_name('observe.py'))
observer=importlib.util.module_from_spec(spec);spec.loader.exec_module(observer)

class ProjectionTests(unittest.TestCase):
    def test_independent_share_memo_creator_and_viewer(self):
        file=observer.ROOT/'results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/inputs/memos-original.json'
        inputs=json.loads(file.read_text())['resourceInputs']['shared-memo-access']
        inputs['contextUserID']=22
        inputs['memos'][0]['SpaceID']=8
        inputs['spaces']=[{'ID':8},{'ID':9}]
        inputs['memberships']=[{'SpaceID':8,'UserID':22,'Role':'USER'},{'SpaceID':9,'UserID':17,'Role':'ADMIN'}]
        actual=observer.project_world(inputs)
        self.assertEqual((actual['Memo']['ID'],actual['Memo']['CreatorID'],actual['Viewer']['ID'],actual['SharedMemoID']),(43,17,22,43))
        # An intentionally wrong adapter projection is distinguishable by the
        # original function's concrete query arguments, not DSL output.
        altered=copy.deepcopy(actual);altered['Memo']['CreatorID']=22
        import tempfile
        base=observer.ROOT/'.tmp/bu-source';base.mkdir(parents=True,exist_ok=True)
        go=observer.ROOT/'.tmp/bt-source/toolchain/go/bin/go.exe'
        source=observer.ROOT/'.tmp/bt-source/memos-cb42e326ba9cc266a6a9570c53e0fe04c62793f4'
        a=observer.observe(source,Path(tempfile.mkdtemp(dir=base)),go,actual)
        b=observer.observe(source,Path(tempfile.mkdtemp(dir=base)),go,altered)
        self.assertEqual(a['events'][0]['arguments'],{'ID':17})
        self.assertEqual(b['events'][0]['arguments'],{'ID':22})
        self.assertEqual(a['events'][2]['arguments'],{'SpaceID':8,'UserID':22})
        self.assertNotEqual(a['events'][0],b['events'][0])

if __name__=='__main__':unittest.main()
