import fs from 'fs';  
const files = ['Report1GradeTable.tsx', 'Report2ExamRoom.tsx', 'Report3RoomTimetable.tsx', 'Report4SeatMap.tsx', 'Report5ClassTable.tsx'];  
files.forEach(f => {  
  let code = fs.readFileSync('src/pages/reports/' + f, 'utf8');  
  if (!code.includes('exportMultipleDOMTablesToExcel')) {  
    code = code.replace(/import \{ Printer(.*?)\} from 'lucide-react';/, 'import { Printer, Download} from \'lucide-react\';\nimport { exportMultipleDOMTablesToExcel } from \'../../utils/excelExport\';');  
    code = code.replace(/(<button[>]*?onClick=\{\(\) => window\.print\(\)\}[>]*?>[\s\S]*?<\/button>)/m, '\n        <button onClick={() => exportMultipleDOMTablesToExcel(\'table\', \'Ãâ·Â¹°.xlsx\')} className=\" px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition "disabled:opacity-40\><Download className=\w-4" "h-4\ /> ¿¢¼¿ ³»º¸³»±â</button>');  
    fs.writeFileSync('src/pages/reports/' + f, code);  
  }  
});  
