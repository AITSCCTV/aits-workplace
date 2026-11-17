export const isPrivilegedRole=role=>['admin','managing-director'].includes(role);
const sales=['assistant','crm','prices','quotations','tasks','projects','calendar','calendar-write','line','line-send','design-studio','service','forms'];
export const rolePresets=[
 {id:'managing-director',th:'กรรมการผู้จัดการ',en:'Managing Director',tools:null},
 {id:'sales',th:'ฝ่ายขาย',en:'Sales',tools:sales},
 {id:'administrator',th:'เจ้าหน้าที่ธุรการ',en:'Administrator',tools:[...sales,'inventory']},
 {id:'marketing',th:'การตลาด',en:'Marketing',tools:['assistant','tasks','projects','calendar','content-studio']},
 {id:'network-engineer',th:'วิศวกรเครือข่าย',en:'Network Engineer',tools:['assistant','tasks','projects','calendar','calendar-write','design-studio','floorplan-studio','inventory','service','forms']},
 {id:'programmer',th:'โปรแกรมเมอร์',en:'Programmer',tools:['assistant','tasks','projects','calendar','design-studio','floorplan-studio']},
 {id:'foreman',th:'หัวหน้าช่าง',en:'Foreman',tools:['assistant','tasks','projects','calendar','floorplan-studio','inventory','service','forms']},
 {id:'hr',th:'ฝ่ายบุคคล',en:'HR',tools:['assistant','calendar','calendar-write','forms']},
 {id:'accountant',th:'บัญชี',en:'Accountant',tools:['assistant','crm','prices','quotations','tasks','projects','calendar','inventory']},
 // Retain old identifiers for existing accounts; new assignments use the roles above.
 {id:'admin',th:'ผู้ดูแลระบบ (เดิม)',en:'System administrator (legacy)',tools:null,legacy:true},
 {id:'engineer',th:'วิศวกร (เดิม)',en:'Engineer (legacy)',tools:['tasks','projects','calendar','design-studio','floorplan-studio','inventory','service','forms'],legacy:true},
 {id:'employee',th:'พนักงาน (เดิม)',en:'Employee (legacy)',tools:['calendar','forms'],legacy:true},
 {id:'custom',th:'กำหนดเอง (เดิม)',en:'Custom (legacy)',tools:[],legacy:true}
];
