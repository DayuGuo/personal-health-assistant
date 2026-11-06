import {it,expect,vi} from 'vitest';
import {reconcile} from '../../../src/providers/google/reconcile';
it('reads later pages and fixes a single source family',async()=>{const fn=vi.fn().mockResolvedValueOnce({dataPoints:[{id:1}],nextPageToken:'next'}).mockResolvedValueOnce({dataPoints:[{id:2}]});const data=await reconcile({requestJson:fn} as any,'sleep',100);expect(data).toHaveLength(2);expect(fn.mock.calls[1]![1].query).toEqual({pageSize:25,pageToken:'next',dataSourceFamily:'users/me/dataSourceFamilies/google-wearables'});});
it('fails on a repeated page token instead of returning incomplete records',async()=>{const fn=vi.fn(async()=>({dataPoints:[],nextPageToken:'same'}));await expect(reconcile({requestJson:fn} as any,'sleep',100)).rejects.toThrow(/partial results refused/);});
