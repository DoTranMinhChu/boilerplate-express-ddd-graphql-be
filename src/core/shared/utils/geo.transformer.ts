
export const PointTransformer = {
    to: (value: [number, number] | null) => {
        if (!value) return null;
        return {
            type: 'Point',
            coordinates: value, // [lng, lat]
        };
    },
    from: (value: any) => {
        if (!value) return null;
        return value.coordinates as [number, number];
    },
};

export const PolygonTransformer = {
    to: (value: [number, number][] | null) => {
        if (!value) return null;
        // Tự động đóng vòng nếu chưa đóng
        const ring = [...value];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push(first);
        }
        return {
            type: 'Polygon',
            coordinates: [ring],
        };
    },
    from: (value: any) => {
        if (!value) return null;
        // Bỏ điểm đóng vòng cuối khi trả ra
        const ring: [number, number][] = value.coordinates[0];
        return ring.slice(0, -1) as [number, number][];
    },
};