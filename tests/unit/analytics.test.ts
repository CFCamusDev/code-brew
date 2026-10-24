import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const payload = {transaction_id:'CB-000123',value:82,shipping:8,items:[{item_id:'espresso-250',item_name:'Espresso',price:37,quantity:2}]};
const storage = () => {
  const map = new Map<string,string>();
  return {getItem:(key:string)=>map.get(key) ?? null,setItem:(key:string,value:string)=>map.set(key,value)};
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('PUBLIC_ANALYTICS_ENV', 'production');
  vi.stubGlobal('window', {dataLayer:[]});
  vi.stubGlobal('location', {hostname:'coffeecodebrew.com',origin:'https://coffeecodebrew.com',pathname:'/pedido/private-token',search:'?email=private@example.com&utm_source=instagram&utm_medium=social&utm_campaign=hotfix_launch'});
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('document', {head:{append:vi.fn()},createElement:()=>({})});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('CB-204',()=>{
  it('never initializes on development or a preview build',async()=>{
    const {track}=await import('../../src/lib/analytics');
    vi.stubEnv('PROD',false);
    expect(track('view_item',payload)).toBe(false);
    vi.stubEnv('PROD',true);vi.stubEnv('PUBLIC_ANALYTICS_ENV','disabled');
    expect(track('view_item',payload)).toBe(false);
    expect(window.dataLayer).toEqual([]);
  });
  it('uses an allowlist and removes private URL details while retaining UTMs',async()=>{
    const {track}=await import('../../src/lib/analytics');
    track('purchase',{...payload,email:'private@example.com',phone:'999888777',items:[{...payload.items[0],email:'private@example.com'}]} as unknown as typeof payload);
    const data=JSON.stringify(window.dataLayer);
    expect(data).not.toContain('private');expect(data).not.toContain('999888777');
    expect(data).toContain('instagram');expect(data).toContain('hotfix_launch');
    expect(data).toContain('/pedido/confirmacion');expect(data).toContain('CB-000123');
  });
  it('deduplicates a paid order across reloads and allows another order',async()=>{
    await (await import('../../src/lib/analytics')).trackPurchase(payload);
    vi.resetModules();
    const {trackPurchase}=await import('../../src/lib/analytics');
    await trackPurchase(payload);
    await trackPurchase({...payload,transaction_id:'CB-000124'});
    const purchases=window.dataLayer.filter(row=>(row as Record<number,unknown>)[1]==='purchase');
    expect(purchases).toHaveLength(2);
  });
  it('keeps checkout working when browser storage is blocked',async()=>{
    vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error('blocked');}});
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');}});
    const {trackPurchase}=await import('../../src/lib/analytics');
    await trackPurchase(payload);await trackPurchase(payload);
    expect(window.dataLayer.filter(row=>(row as Record<number,unknown>)[1]==='purchase')).toHaveLength(1);
  });
});

