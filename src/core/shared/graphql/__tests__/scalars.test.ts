import { parse, ValueNode } from 'graphql';
import { GraphQLMixed } from '../scalars';

/** Parse a GraphQL literal value expression (the part after `field: `) into its AST node,
 * the same shape `parseLiteral` receives at runtime — reuses the real GraphQL parser
 * instead of hand-building AST nodes, so this test exercises the exact same code path
 * a real query document would. */
function literalAst(source: string): ValueNode {
    const doc = parse(`{ x(v: ${source}) }`);
    const field = (doc.definitions[0] as any).selectionSet.selections[0];
    return field.arguments[0].value;
}

describe('GraphQLMixed.parseLiteral', () => {
    it('parses a string literal', () => {
        expect(GraphQLMixed.parseLiteral(literalAst('"ao-thun"'), undefined)).toBe('ao-thun');
    });

    it('parses an int literal', () => {
        expect(GraphQLMixed.parseLiteral(literalAst('42'), undefined)).toBe(42);
    });

    it('parses a float literal', () => {
        expect(GraphQLMixed.parseLiteral(literalAst('4.5'), undefined)).toBe(4.5);
    });

    it('parses a boolean literal', () => {
        expect(GraphQLMixed.parseLiteral(literalAst('true'), undefined)).toBe(true);
    });

    it('parses a null literal', () => {
        expect(GraphQLMixed.parseLiteral(literalAst('null'), undefined)).toBeNull();
    });

    it('parses an object literal into a plain JS object, not a raw AST node', () => {
        const result = GraphQLMixed.parseLiteral(literalAst('{ field: "category", value: "ao-thun" }'), undefined);
        expect(result).toEqual({ field: 'category', value: 'ao-thun' });
    });

    it('parses a list literal of objects into plain JS values', () => {
        const result = GraphQLMixed.parseLiteral(
            literalAst('[{ field: "category", operator: "$eq", value: "ao-thun" }]'),
            undefined,
        );
        expect(result).toEqual([{ field: 'category', operator: '$eq', value: 'ao-thun' }]);
    });

    it('parses a nested list-of-objects-with-scalar-leaves (the real ContentEntryFieldFilterInput[] shape)', () => {
        const result = GraphQLMixed.parseLiteral(
            literalAst('[{ field: "category", operator: "$eq", value: "ao-thun" }, { field: "budget", operator: "$gte", value: 100 }]'),
            undefined,
        );
        expect(result).toEqual([
            { field: 'category', operator: '$eq', value: 'ao-thun' },
            { field: 'budget', operator: '$gte', value: 100 },
        ]);
    });
});
