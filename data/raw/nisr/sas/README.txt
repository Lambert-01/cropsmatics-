Cropmatics SAS Full Raw Extraction
==================================

This package contains a direct worksheet-by-worksheet CSV extraction of the four supplied SAS Excel workbooks.
No analytical transformation, aggregation, normalization, imputation, or interpretation was applied.
Blank cells are preserved as blank CSV fields. Each CSV retains the complete used range of its source worksheet,
including title/header rows and any spacer rows/cells that occur inside that range.

Use manifest.csv to map every CSV back to its original workbook, worksheet, and used range.
