// Presentation-only adapters preserve the original Sites source trees.
export function toolPresentation(source){
 const titles=[['ทุกงาน ชัดเจนในที่เดียว','งาน','Tasks'],['ศูนย์บริหารโครงการ','โครงการ','Projects'],['วันนี้ ใครทำอะไร','ปฏิทิน','Calendar'],['อุปกรณ์พร้อม งานเดินต่อ','คลังอุปกรณ์','Inventory'],['ประวัติบริการและฝึกอบรม','บริการและฝึกอบรม','Service & training']];
 for(const [old,th,en] of titles)source=source.replace('<h1>'+old+'</h1>',`<h1 data-no-translate>{window.AITS_I18N.language()==='en'?${JSON.stringify(en)}:${JSON.stringify(th)}}</h1>`);
 // Only static introductory copy is folded; warnings and record content stay visible.
 source=source.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)<p>([^<{}]+)<\/p>/g,(_,title,copy)=>title+`<details className="tool-guide"><summary data-no-translate>{window.AITS_I18N.language()==='en'?'Guide':'คำแนะนำ'}</summary><p>${copy}</p></details>`);
 return source;
}
