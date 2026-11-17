const icons={
 navigation:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 overview:'M3 12 12 3l9 9M5 10v11h14V10M9 21v-7h6v7',
 chat:'M4 4h16v13H9l-5 4zM8 9h8m-8 4h5',
 ai:'M8 4h8M12 2v2M5 7h14v13H5zM2 11v5m20-5v5M9 11v2m6-2v2M9 17h6',
 brief:'M4 4h16v17H4zM8 2v4m8-4v4M4 9h16M8 13h8m-8 4h5',
 people:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M7 21v-3a5 5 0 0 1 10 0v3M7 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M1 18v-3a3.5 3.5 0 0 1 5-3.16M22 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M23 18v-3a3.5 3.5 0 0 0-5-3.16',
 line:'M4 4h16v13H9l-5 4zM8 8h8m-8 4h5',
 review:'M4 4h16v16H4zM8 12l3 3 5-6',
 content:'M4 3h16v18H4zM8 7h8m-8 4h8m-8 4h5',
 floorplan:'M3 3h18v18H3zM3 10h8V3m0 7v11m0-7h10',
 design:'m15 4 5 5-11 11H4v-5zM13 6l5 5',
 inventory:'m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11',
 service:'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7zM8 12l3 3 5-6',
 access:'M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-3a7 7 0 0 1 10-6M14 15h8v7h-8zM16 15v-2a2 2 0 0 1 4 0v2M18 18v1',
 calendar:'M4 6h16v14H4zM8 3v6m8-6v6M4 11h16',
 form:'M4 3h16v18H4zM8 7h8m-8 4h8m-8 4h5',
 survey:'M3 3h18v18H3zM7 8h10M7 12h7M7 16h4',
};
const item=(path,th,en,icon,tool,group,shortTh=th,shortEn=en)=>({path,th,en,icon:icons[icon],tool,group,shortTh,shortEn});
export const navigationItems=[
 item('navigation/','ทางลัด','Navigation','navigation',null,'home'),
 item('','ภาพรวม','Overview','overview',null,'home'),
 item('messaging/','แชททีม','Team Chat','chat','messaging','communication'),
 item('assistant/','ผู้ช่วย AI','AI Assistant','ai','assistant','work','AI','AI'),
 item('weeklybrief/','สรุปประชุมประจำสัปดาห์','WeeklyBrief AI','brief','weeklybrief','work','สรุปประชุม','WeeklyBrief'),
 item('project-management/','จัดการโครงการ','Project Management','people','project-management','work','โครงการทีม','Project Management'),
 item('project-board/line/','บทสนทนา LINE','LINE conversations','line','line','communication','LINE','LINE'),
 item('project-board/review/','ตรวจข้อเสนอ','Review queue','review','review','work','ตรวจสอบ','Review'),
 item('content-studio/','สตูดิโอคอนเทนต์','Content Studio','content','content-studio','studios','คอนเทนต์','Content'),
 item('floorplan-studio/','สตูดิโอแปลน','Floorplan Studio','floorplan','floorplan-studio','studios','แปลน','Floorplan'),
 item('design-studio/','สตูดิโอออกแบบ','Design Studio','design','design-studio','studios','ออกแบบ','Design'),
 item('inventory/','คลังอุปกรณ์','Inventory','inventory','inventory','work','คลัง','Inventory'),
 item('project-board/service/','บริการและประกัน','Service & Warranty','service','service','work','บริการ','Service'),
 item('admin/','สิทธิ์การเข้าถึง','Access','access','admin','admin','สิทธิ์','Access'),
];
export const additionalNavigation=[
 item('project-board/calendar/','ปฏิทิน','Calendar','calendar','calendar','work'),
 item('project-board/forms/sales/','รับความต้องการลูกค้า','Brief','form','forms','work'),
 item('project-board/forms/survey/','สำรวจหน้างาน','Survey','survey','forms','work'),
];
export const projectSections=[
 {path:'project-management/',th:'งานและกำหนดการ',en:'Tasks & timelines',tool:'project-management'},
 {path:'project-board/projects/',th:'พื้นที่โครงการ',en:'Project workspace',tool:'projects'},
 {path:'project-board/',th:'ติดตามงานขาย',en:'Sales follow-up',tool:'tasks'},
 {path:'project-board/calendar/',th:'ปฏิทิน',en:'Calendar',tool:'calendar'},
];
export function canNavigate(item,session){return !item.tool||!!(item.tool==='admin'?session?.info()?.admin:session?.can(item.tool));}
