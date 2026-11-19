import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {navigationItems, additionalNavigation} from './navigation-catalog.mjs';
import './navigation.css';
import './master-navigation.css';

const items = [...navigationItems.filter(item => item.path !== 'navigation/'), ...additionalNavigation];
const departments = [['office','ธุรการสำนักงาน','Office Admin'],['sales','ฝ่ายขาย','Sales'],['network','วิศวกรเครือข่าย','Network Engineer'],['accounting','ฝ่ายบัญชี','Accounting Officer']];
const externalTools = [
  ['companyGoogleCalendar','ปฏิทินบริษัท','Company Calendar','office','calendar'],
  ['chat','แชทเรียลไทม์','Real-time Chat','office','messaging'],
  ['customerSummary','สรุปข้อมูลลูกค้า','Customer Summary','sales','admin'],
  ['salesCosting','ต้นทุนงานขาย','Sales Costing','sales','inventory'],
  ['cameraRentalQuotation','ใบเสนอราคาเช่ากล้อง','Camera Rental Quote','sales','forms'],
  ['projectTracking','ติดตามโครงการ','Project Tracking','network','project-management'],
  ['priceCompare','รายการราคาตัวแทนจำหน่าย','Distributor Price List','network','inventory'],
  ['expenses','ค่าใช้จ่าย','Expenses','accounting','forms'],
  ['paymentSlips','สลิปการชำระเงิน','Payment Slips','accounting','forms'],
  ['inventory','คลังสินค้า','Inventory','accounting','inventory'],
].map(([tab,th,en,group,tool]) => ({path:tab,th,en,shortTh:th,shortEn:en,group,tool:'external',icon:items.find(item=>item.tool===tool)!.icon,url:'https://aits-dashboard-bwb.pages.dev/?tab='+tab}));
const groups = [['all','ทั้งหมด','All'],['home','ภาพรวม','Overview'],['communication','การสื่อสาร','Communication'],['work','งานและโครงการ','Work'],['studios','สตูดิโอ','Studios'],['admin','จัดการ','Management'],...departments];
function MasterNavigation() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [language, setLanguage] = useState('th');
  const t = (th:string,en:string) => language === 'th' ? th : en;
  const matches = (item:typeof items[number]) => (group === 'all' || item.group === group) && [item.th,item.en,item.shortTh,item.shortEn].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const externalVisible = externalTools.filter(matches);
  const visible = items.filter(item => (group === 'all' || item.group === group) && [item.th,item.en,item.shortTh,item.shortEn].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const cards = (list:Array<typeof items[number] & {url?:string}>) => list.map(item => <a className={'nav-card tone-'+item.group} key={item.path} href={item.url || '../'+item.path+'?workspace-entry=1'} target="_blank" rel="noopener noreferrer" aria-label={t(item.th,item.en)+' · '+t('เปิดในแท็บใหม่','Opens in a new tab')}> <span className="nav-card-art">{item.tool === 'line' ? <img src="../brand/line-icon.png" width="54" height="54" alt=""/> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={item.icon}/></svg>}</span><h2 className="nav-card-label">{t(item.th,item.en)}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></h2>{item.url && <span className="nav-card-credit">-Kaung</span>}</a>);
  return <main className="navigation-page">
    <div className="master-brand"><img src="../brand/aits-company-logo.png" alt="AitsCCTV" width="80" height="53"/><div className="master-language" aria-label="Language / ภาษา">{['th','en'].map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => {setLanguage(lang);document.documentElement.lang=lang;}}>{lang.toUpperCase()}</button>)}</div></div>
    <header className="navigation-heading"><div><p>AITS / WORKSPACE</p><h1>Master Navigation</h1></div><label className="navigation-search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('ค้นหาเครื่องมือ','Find a tool')} aria-label={t('ค้นหาเครื่องมือ','Find a tool')}/></label></header>
    <div className="navigation-filters" role="group" aria-label={t('หมวดหมู่เครื่องมือ','Tool categories')}>{groups.map(([id,th,en]) => <button key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{t(th,en)}</button>)}</div>
    <section className="navigation-grid" aria-label={t('เครื่องมือ','Tools')}>{cards(visible.filter(item => item.tool !== 'forms'))}</section>
    {departments.map(([id,th,en]) => externalVisible.some(item=>item.group===id) && <section className="navigation-forms master-department" key={id} aria-label={t(th,en)}><h2>{t(th,en)}</h2><div className="navigation-grid">{cards(externalVisible.filter(item=>item.group===id))}</div></section>)}
    {visible.some(item => item.tool === 'forms') && <section className="navigation-forms" aria-label={t('แบบฟอร์ม','Forms')}><h2>{t('แบบฟอร์ม','Forms')}</h2><div className="navigation-grid">{cards(visible.filter(item => item.tool === 'forms'))}</div></section>}
    {!visible.length && !externalVisible.length && <p className="navigation-empty" role="status">{t('ไม่พบเครื่องมือที่ตรงกัน','No matching tools.')}</p>}
  </main>;
}
createRoot(document.getElementById('app')!).render(<MasterNavigation/>);
