import pg from 'pg';

// 1114 = timestamp (without time zone)
// 1184 = timestamptz (with time zone)
// 1082 = date

// timestamp without time zone
pg.types.setTypeParser(1114, (val: string | null) => {
    if (val === null) return null;
    return new Date(val + 'Z'); // ép về UTC
});

// timestamptz
pg.types.setTypeParser(1184, (val: string | null) => {
    if (val === null) return null;
    return new Date(val);
});

// date
pg.types.setTypeParser(1082, (val: string | null) => {
    if (val === null) return null;
    return new Date(val + 'T00:00:00Z');
});