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



function autoWidth(
  worksheet: XLSX.WorkSheet
) {

  const range =
    XLSX.utils.decode_range(
      worksheet["!ref"] || "A1"
    );


  const widths: number[] = [];


  for (
    let column = range.s.c;
    column <= range.e.c;
    column++
  ) {

    let maxLength = 10;


    for (
      let row = range.s.r;
      row <= range.e.r;
      row++
    ) {

      const cell =
        worksheet[
          XLSX.utils.encode_cell({
            r: row,
            c: column,
          })
        ];


      if (cell?.v) {

        maxLength =
          Math.max(
            maxLength,
            String(cell.v).length
          );

      }

    }


    widths.push(
      maxLength + 3
    );

  }


  worksheet["!cols"] =
    widths.map(
      width => ({
        width
      })
    );

}





function formatCurrency(
  worksheet: XLSX.WorkSheet
) {

  const range =
    XLSX.utils.decode_range(
      worksheet["!ref"] || "A1"
    );


  for (
    let row = 1;
    row <= range.e.r;
    row++
  ) {

    for (
      let column = 1;
      column <= range.e.c;
      column++
    ) {

      const cell =
        worksheet[
          XLSX.utils.encode_cell({
            r: row,
            c: column,
          })
        ];


      if (
        cell &&
        typeof cell.v === "number"
      ) {

        cell.z =
          '"₱"#,##0.00';

      }

    }

  }

}





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



      // Freeze header row
      worksheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };



      // Adjust column widths
      autoWidth(
        worksheet
      );



      // Format numbers as PHP currency
      formatCurrency(
        worksheet
      );



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