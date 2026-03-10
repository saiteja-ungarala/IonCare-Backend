const pool = require('./src/config/db').default || require('./src/config/db');

async function patch() {
    try {
        console.log('Adding missing cancel columns to bookings table...');
        await pool.query(`
            ALTER TABLE bookings 
            ADD COLUMN cancel_reason VARCHAR(255) NULL, 
            ADD COLUMN cancelled_by INT NULL, 
            ADD COLUMN cancelled_at DATETIME NULL;
        `);
        console.log('Successfully added cancel columns!');

        console.log('Adding missing cancel columns to schema.sql for future setups...');
        // Handled via edit
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist.');
        } else {
            console.error('Error:', e);
        }
    } finally {
        process.exit(0);
    }
}

patch();
