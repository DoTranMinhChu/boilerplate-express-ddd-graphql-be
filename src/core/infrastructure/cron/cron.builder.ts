type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
type Month = 'JAN' | 'FEB' | 'MAR' | 'APR' | 'MAY' | 'JUN' | 'JUL' | 'AUG' | 'SEP' | 'OCT' | 'NOV' | 'DEC';

interface EveryOptions {
    seconds?: number;
    minutes?: number;
    hours?: number;
}

interface DailyOptions {
    hour: number;
    minute?: number;
    second?: number;
}

interface WeeklyOptions {
    days: DayOfWeek[];
    hour: number;
    minute?: number;
}

interface MonthlyOptions {
    dayOfMonth: number;
    hour: number;
    minute?: number;
}

interface AtOptions {
    second?: number;
    minute: number;
    hour: number;
    days?: DayOfWeek[];
    months?: Month[];
}

const DAY_MAP: Record<DayOfWeek, string> = {
    MON: '1', TUE: '2', WED: '3', THU: '4',
    FRI: '5', SAT: '6', SUN: '0'
};

const MONTH_MAP: Record<Month, string> = {
    JAN: '1', FEB: '2', MAR: '3', APR: '4',
    MAY: '5', JUN: '6', JUL: '7', AUG: '8',
    SEP: '9', OCT: '10', NOV: '11', DEC: '12'
};

export const CronBuilder = {

    every(options: EveryOptions): string {
        if (options.seconds !== undefined) return `*/${options.seconds} * * * * *`;
        if (options.minutes !== undefined) return `0 */${options.minutes} * * * *`;
        if (options.hours !== undefined) return `0 0 */${options.hours} * * *`;
        throw new Error('[CronBuilder] every() cần ít nhất một trong: seconds, minutes, hours');
    },

    /**
     * Mỗi ngày vào giờ cụ thể
     * @example daily({ hour: 8, minute: 30 }) → "0 30 8 * * *"
     */
    daily(options: DailyOptions): string {
        const s = options.second ?? 0;
        const m = options.minute ?? 0;
        return `${s} ${m} ${options.hour} * * *`;
    },

    /**
     * Các ngày trong tuần
     * @example weekly({ days: ['MON', 'FRI'], hour: 9 }) → "0 0 9 * * 1,5"
     */
    weekly(options: WeeklyOptions): string {
        const m = options.minute ?? 0;
        const days = options.days.map(d => DAY_MAP[d]).join(',');
        return `0 ${m} ${options.hour} * * ${days}`;
    },

    /**
     * Ngày cụ thể trong tháng
     * @example monthly({ dayOfMonth: 1, hour: 0 }) → "0 0 0 1 * *"
     */
    monthly(options: MonthlyOptions): string {
        const m = options.minute ?? 0;
        return `0 ${m} ${options.hour} ${options.dayOfMonth} * *`;
    },

    /**
     * Thứ 2 đến Thứ 6
     * @example weekdays({ hour: 9 }) → "0 0 9 * * 1-5"
     */
    weekdays(options: DailyOptions): string {
        const s = options.second ?? 0;
        const m = options.minute ?? 0;
        return `${s} ${m} ${options.hour} * * 1-5`;
    },

    /**
     * Thứ 7 & Chủ nhật
     * @example weekends({ hour: 10 }) → "0 0 10 * * 0,6"
     */
    weekends(options: DailyOptions): string {
        const s = options.second ?? 0;
        const m = options.minute ?? 0;
        return `${s} ${m} ${options.hour} * * 0,6`;
    },

    /**
     * Tùy chỉnh hoàn toàn
     * @example at({ hour: 8, minute: 0, days: ['MON'], months: ['JAN'] })
     */
    at(options: AtOptions): string {
        const s = options.second ?? 0;
        const days = options.days?.map(d => DAY_MAP[d]).join(',') ?? '*';
        const months = options.months?.map(m => MONTH_MAP[m]).join(',') ?? '*';
        return `${s} ${options.minute} ${options.hour} * ${months} ${days}`;
    },
};