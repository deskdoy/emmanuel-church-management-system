import * as XLSX from "xlsx";


export type ExcelSheet = {

  name: string;

  headers: string[];

  rows: (string | number)[][];

};



export type ExcelExport = {

  filename: string;

  sheets: ExcelSheet[];

};



export function downloadReportExcel(
  report: ExcelExport
) {


  const workbook =
    XLSX.utils.book_new();



  report.sheets.forEach(
    sheet => {


      const worksheet =
        XLSX.utils.aoa_to_sheet([

          sheet.headers,

          ...sheet.rows,

        ]);



      XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        sheet.name

      );


    }

  );



  XLSX.writeFile(

    workbook,

    report.filename

  );

}