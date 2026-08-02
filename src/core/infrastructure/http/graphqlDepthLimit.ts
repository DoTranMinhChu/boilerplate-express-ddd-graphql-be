// src/core/infrastructure/http/graphqlDepthLimit.ts
//
// A minimal, dependency-free GraphQL query-depth validation rule (equivalent to the
// `graphql-depth-limit` package). Without this, nothing bounds how deeply a client can
// nest/alias a query — combined with a small DB connection pool, one crafted deeply
// nested query can fan out into enough DB round trips to starve every other request.
//
// Depth is measured in nested SelectionSets, following fragment spreads. Introspection
// fields (`__schema`, `__type`) are excluded from the count since tooling needs them.
import {
    ASTVisitor,
    FragmentDefinitionNode,
    GraphQLError,
    Kind,
    OperationDefinitionNode,
    ValidationContext,
} from 'graphql';

function fieldDepth(
    node: OperationDefinitionNode | FragmentDefinitionNode,
    fragments: Record<string, FragmentDefinitionNode>,
    visitedFragments: Set<string> = new Set(),
): number {
    let maxDepth = 0;

    for (const selection of node.selectionSet.selections) {
        switch (selection.kind) {
            case Kind.FIELD: {
                if (selection.name.value.startsWith('__')) continue; // introspection
                const childDepth = selection.selectionSet
                    ? fieldDepth({ selectionSet: selection.selectionSet } as any, fragments, visitedFragments)
                    : 0;
                maxDepth = Math.max(maxDepth, 1 + childDepth);
                break;
            }
            case Kind.INLINE_FRAGMENT: {
                const childDepth = fieldDepth({ selectionSet: selection.selectionSet } as any, fragments, visitedFragments);
                maxDepth = Math.max(maxDepth, childDepth);
                break;
            }
            case Kind.FRAGMENT_SPREAD: {
                const fragmentName = selection.name.value;
                if (visitedFragments.has(fragmentName)) break; // cycle guard
                const fragment = fragments[fragmentName];
                if (!fragment) break;
                visitedFragments.add(fragmentName);
                const childDepth = fieldDepth(fragment, fragments, visitedFragments);
                maxDepth = Math.max(maxDepth, childDepth);
                break;
            }
        }
    }

    return maxDepth;
}

/**
 * Build a validation Rule enforcing a max selection-set nesting depth.
 * Add to ApolloServer's `validationRules`.
 */
export function createDepthLimitRule(maxDepth: number) {
    return function DepthLimitRule(context: ValidationContext): ASTVisitor {
        const fragments: Record<string, FragmentDefinitionNode> = {};
        for (const def of context.getDocument().definitions) {
            if (def.kind === Kind.FRAGMENT_DEFINITION) fragments[def.name.value] = def;
        }

        return {
            OperationDefinition(node) {
                const depth = fieldDepth(node, fragments);
                if (depth > maxDepth) {
                    context.reportError(
                        new GraphQLError(
                            `Query is too deeply nested (depth ${depth}, max ${maxDepth}). ` +
                            `Split it into multiple requests or reduce nesting.`,
                            { nodes: node },
                        ),
                    );
                }
            },
        };
    };
}
