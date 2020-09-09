import {
  SchemaComposer,
  Resolver,
  ObjectTypeComposerFieldConfigAsObjectDefinition,
  inspect,
} from 'graphql-compose';
import { graphql, ExecutionResult } from 'graphql-compose/lib/graphql';

const FIELD = 'test_field';

interface TestOperationOpts {
  schemaComposer: SchemaComposer<any>;
  operation: string;
  variables?: Record<string, any>;
  source?: Record<string, any>;
  context?: Record<string, any>;
}

async function testOperation(opts: TestOperationOpts): Promise<ExecutionResult> {
  const res = await graphql({
    schema: opts.schemaComposer.buildSchema(),
    source: opts.operation,
    rootValue: opts?.source || {},
    contextValue: opts?.context || {},
    variableValues: opts?.variables,
  });
  return res;
}

interface TestFieldConfigOpts {
  args?: Record<string, any>;
  field: ObjectTypeComposerFieldConfigAsObjectDefinition<any, any, any> | Resolver;
  selection: string;
  source?: Record<string, any>;
  context?: Record<string, any>;
  schemaComposer?: SchemaComposer<any>;
}

export async function testFieldConfig(opts: TestFieldConfigOpts): Promise<any> {
  const { field, selection, args, ...restOpts } = opts;

  const sc = opts?.schemaComposer || new SchemaComposer();
  sc.Query.setField(FIELD, field);

  const ac = _getArgsForQuery(field, args, sc);
  const res = await testOperation({
    ...restOpts,
    variables: args,
    operation: `
      query ${ac.queryVars} {
        ${FIELD}${ac.fieldVars} ${selection.trim()}
      }
    `,
    schemaComposer: sc,
  });

  if (res.errors) {
    throw new Error((res?.errors?.[0] as any) || 'GraphQL Error');
  }

  return res?.data?.[FIELD];
}

function _getArgsForQuery(
  fc: ObjectTypeComposerFieldConfigAsObjectDefinition<any, any, any> | Resolver,
  variables: Record<string, any> = {},
  schemaComposer?: SchemaComposer<any>
): {
  queryVars: string;
  fieldVars: string;
} {
  const sc = schemaComposer || new SchemaComposer();
  sc.Query.setField(FIELD, fc);

  const varNames = Object.keys(variables);

  const argNames = sc.Query.getFieldArgNames(FIELD);
  if (argNames.length === 0 && varNames.length > 0) {
    throw new Error(
      `FieldConfig does not have any arguments. But in test you provided the following variables: ${inspect(
        variables
      )}`
    );
  }

  varNames.forEach((varName) => {
    if (!argNames.includes(varName)) {
      throw new Error(
        `FieldConfig does not have '${varName}' argument. Available arguments: '${argNames.join(
          "', '"
        )}'.`
      );
    }
  });

  argNames.forEach((argName) => {
    if (sc.Query.isFieldArgNonNull(FIELD, argName)) {
      const val = variables[argName];
      if (val === null || val === undefined) {
        throw new Error(
          `FieldConfig has required argument '${argName}'. But you did not provide it in your test via variables: '${inspect(
            variables
          )}'.`
        );
      }
    }
  });

  const queryVars = varNames
    .map((n) => `$${n}: ${String(sc.Query.getFieldArgType(FIELD, n))}`)
    .join(' ');
  const fieldVars = varNames.map((n) => `${n}: $${n}`).join(' ');

  return {
    queryVars: queryVars ? `(${queryVars})` : '',
    fieldVars: fieldVars ? `(${fieldVars})` : '',
  };
}
