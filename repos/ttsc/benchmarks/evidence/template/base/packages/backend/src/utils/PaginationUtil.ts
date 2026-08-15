import type { IPage } from "{{apiPackageName}}";

/** Builds paginated Prisma queries with stable response metadata. */
export namespace PaginationUtil {
  /** Inputs needed to execute and transform one paginated query. */
  export interface IProps<
    Where extends object,
    OrderBy extends object,
    Payload extends object,
    Raw extends object,
    Output extends object,
  > {
    /** Prisma-compatible read and count operations. */
    schema: {
      findMany(
        input: Payload & {
          skip?: number;
          take?: number;
          where?: Where;
          orderBy?: OrderBy | OrderBy[];
        },
      ): Promise<Raw[]>;
      count(input: { where: Where }): Promise<number>;
    };

    /** Constant query payload merged into every read. */
    payload: Payload;

    /** Maps one raw database record to its public DTO. */
    transform(record: Raw): Output | Promise<Output>;
  }

  /** Creates a paginated query executor from one schema adapter. */
  export const paginate =
    <
      Where extends object,
      OrderBy extends object,
      Payload extends object,
      Raw extends object,
      Output extends object,
    >(
      props: IProps<Where, OrderBy, Payload, Raw, Output>,
    ) =>
    (spec: { where: Where; orderBy: OrderBy[] }) =>
    async (input: IPage.IRequest): Promise<IPage<Output>> => {
      const limit = input.limit ?? 100;
      const current = input.page ?? 1;
      const records = await props.schema.count({ where: spec.where });
      const data = await props.schema.findMany({
        ...props.payload,
        skip: (current - 1) * limit,
        take: limit || records,
        where: spec.where,
        orderBy: spec.orderBy,
      });
      return {
        data: await Promise.all(
          data.map(async (record) => props.transform(record)),
        ),
        pagination: {
          current,
          limit,
          records,
          pages: limit === 0 ? 1 : Math.ceil(records / limit),
        },
      };
    };
}
