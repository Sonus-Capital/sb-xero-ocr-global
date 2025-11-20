// main.js
import { Actor, log } from 'apify';

/**
 * Very small CSV parser (handles commas, quotes, newlines).
 * Returns a matrix: [ [col1, col2, ...], [ ... ], ... ]
 */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    text = String(text ?? '');

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === ',') {
                row.push(field);
                field = '';
            } else if (c === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (c === '\r') {
                // ignore
            } else {
                field += c;
            }
        }
    }

    // flush last field/row
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        rows.push(row);
    }

    return rows;
}

/**
 * Convert CSV matrix into { headers, rows } where rows is
 * an array of objects keyed by header names.
 */
function matrixToObjects(matrix) {
    if (!matrix.length) return { headers: [], rows: [] };

    const headers = matrix[0].map((h) => String(h ?? '').trim());
    const outRows = [];

    for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        // skip completely blank rows
        if (!row || row.every((v) => (v ?? '').toString().trim() === '')) continue;

        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx] == null ? '' : String(row[idx]);
        });
        outRows.push(obj);
    }

    return { headers, rows: outRows };
}

Actor.main(async () => {
    try {
        log.info('*** SB Xero OCR GLOBAL: Actor.main started');

        const input = (await Actor.getInput()) ?? {};
        const maxFiles = input.maxFiles ?? null;
        const csvText = input.ocrTargetsCsv ? String(input.ocrTargetsCsv) : '';

        log.info('Input summary', {
            csvProvided: !!csvText,
            csvLength: csvText.length,
            maxFiles,
        });

        if (!csvText.trim()) {
            log.warning('No ocrTargetsCsv provided or it is empty – exiting.');
            await Actor.setValue('OUTPUT', {
                ok: false,
                reason: 'NO_CSV',
                maxFiles,
                rowCount: 0,
            });
            return;
        }

        // 1) Parse CSV safely
        let matrix;
        try {
            matrix = parseCsv(csvText);
        } catch (err) {
            log.error(`Failed to parse CSV: ${err.message}`);
            await Actor.setValue('OUTPUT', {
                ok: false,
                reason: 'PARSE_ERROR',
                error: String(err.message || err),
            });
            return;
        }

        const { headers, rows } = matrixToObjects(matrix);
        const totalRows = rows.length;

        // 2) Respect maxFiles cap
        const numericMax =
            maxFiles != null && !Number.isNaN(Number(maxFiles))
                ? Math.max(0, Number(maxFiles))
                : totalRows;

        const limitNum = Math.min(totalRows, numericMax);
        const limitedRows = rows.slice(0, limitNum);

        // 3) Map from col1..col12 → canonical field names
        // From 16+:
        // Invoice_ID,Line_item_ID,Attachment_ID,Master_attachment_key,
        // File_name,Drop_box_file_name,Path_lower,Xero_attachment_download_URL,
        // Likely_tracking_horse,Xero_type,Xero_year,Target_type
        const mappedRows = limitedRows.map((r) => ({
            Invoice_ID: r.col1 ?? '',
            Line_item_ID: r.col2 ?? '',
            Attachment_ID: r.col3 ?? '',
            Master_attachment_key: r.col4 ?? '',
            File_name: r.col5 ?? '',
            Drop_box_file_name: r.col6 ?? '',
            Path_lower: r.col7 ?? '',
            Xero_attachment_download_URL: r.col8 ?? '',
            Likely_tracking_horse: r.col9 ?? '',
            Xero_type: r.col10 ?? '',
            Xero_year: r.col11 ?? '',
            Target_type: r.col12 ?? '',
        }));

        log.info('Parsed global OCR targets CSV', {
            headers,
            totalRows,
            limitNum,
            processedRows: mappedRows.length,
        });

        // 4) For now, just push parsed/mapped rows to dataset
        if (mappedRows.length) {
            await Actor.pushData(mappedRows);
        }

        await Actor.setValue('OUTPUT', {
            ok: true,
            message: 'Parsed global OCR targets CSV; OCR step not implemented yet.',
            maxFiles,
            headers,
            totalRows,
            processedRows: mappedRows.length,
        });

        log.info('*** SB Xero OCR GLOBAL: Actor.main finished');
    } catch (err) {
        // Catch absolutely everything so you don’t see “uncaught exception”
        log.error('SB Xero OCR GLOBAL – fatal error', {
            message: err?.message,
            stack: err?.stack,
        });
        throw err; // let Apify mark the run as failed
    }
});
