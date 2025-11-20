// main.js
// CommonJS to avoid ESM warnings in Apify logs.
const { Actor, log } = require('apify');

/**
 * Tiny CSV parser (same style as your earlier OCR A).
 * Handles commas, quotes, newlines.
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
                // ignore CR
            } else {
                field += c;
            }
        }
    }

    // flush last field / row
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        rows.push(row);
    }

    return rows;
}

/**
 * Convert CSV matrix to { headers, rows } with rows as objects keyed by header.
 */
function matrixToObjects(matrix) {
    if (!matrix.length) return { headers: [], rows: [] };

    const headers = matrix[0].map(h => String(h ?? '').trim());
    const outRows = [];

    for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || row.every(v => (v ?? '').toString().trim() === '')) continue;

        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx] == null ? '' : String(row[idx]);
        });
        outRows.push(obj);
    }

    return { headers, rows: outRows };
}

/**
 * Placeholder OCR:
 * For now, we just attach stub fields.
 * Later you can plug in real Dropbox+OCR logic here.
 */
async function runOcrForRow(row) {
    // TODO: Replace this with real OCR integration
    // using Dropbox path (row.Path_lower) + OCR engine.
    return {
        OCR_Status: 'SKIPPED',
        OCR_Text: '',
        OCR_Error: 'OCR not implemented yet in SB Xero OCR Global.'
    };
}

Actor.main(async () => {
    try {
        log.info('*** SB Xero OCR GLOBAL: Actor.main started');

        const input = (await Actor.getInput()) || {};
        const csvText = input.ocrTargetsCsv ? String(input.ocrTargetsCsv) : '';
        const maxFiles = input.maxFiles != null ? Number(input.maxFiles) : null;

        const csvProvided = !!csvText.trim();
        log.info('Input summary', {
            csvProvided,
            csvLength: csvText.length,
            maxFiles
        });

        if (!csvProvided) {
            log.warning('No ocrTargetsCsv provided or it is empty – exiting.');
            await Actor.setValue('OUTPUT', {
                ok: false,
                reason: 'NO_CSV',
                maxFiles,
                rowCount: 0
            });
            return;
        }

        let matrix;
        try {
            matrix = parseCsv(csvText);
        } catch (err) {
            log.error(`Failed to parse CSV: ${err.message}`);
            await Actor.setValue('OUTPUT', {
                ok: false,
                reason: 'PARSE_ERROR',
                error: String(err.message || err),
                maxFiles
            });
            return;
        }

        const { headers, rows } = matrixToObjects(matrix);
        const totalRows = rows.length;

        const limitNum =
            maxFiles != null && !Number.isNaN(limitNum)
                ? Math.max(0, Number(maxFiles))
                : totalRows;

        const toProcess = rows.slice(0, limitNum);

        log.info('Parsed Global OCR targets CSV', {
            headers,
            totalRows,
            processedRows: toProcess.length
        });

        let processedCount = 0;
        let errorCount = 0;

        // Process rows sequentially for now (can batch later if needed).
        for (const row of toProcess) {
            try {
                const ocrResult = await runOcrForRow(row);

                const outputRow = {
                    ...row,
                    OCR_Status: ocrResult.OCR_Status,
                    OCR_Text: ocrResult.OCR_Text,
                    OCR_Error: ocrResult.OCR_Error
                };

                await Actor.pushData(outputRow);
                processedCount += 1;
            } catch (err) {
                errorCount += 1;
                log.error('Error during OCR for row', {
                    message: err?.message,
                    stack: err?.stack
                });

                const outputRow = {
                    ...row,
                    OCR_Status: 'ERROR',
                    OCR_Text: '',
                    OCR_Error: `Unhandled OCR error: ${String(err.message || err)}`
                };

                await Actor.pushData(outputRow);
            }
        }

        await Actor.setValue('OUTPUT', {
            ok: true,
            message: 'Global OCR pipeline executed (OCR currently stubbed).',
            headers,
            totalRows,
            processedRows: toProcess.length,
            processedCount,
            errorCount
        });

        log.info('*** SB Xero OCR GLOBAL: Actor.main finished', {
            processedCount,
            errorCount
        });
    } catch (err) {
        log.error('SB Xero OCR GLOBAL – fatal error', {
            message: err?.message,
            stack: err?.stack
        });
        throw err; // Let Apify mark run as failed
    }
});
