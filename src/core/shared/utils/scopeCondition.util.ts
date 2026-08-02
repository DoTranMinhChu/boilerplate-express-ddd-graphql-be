;
import { FindOptionsWhere } from "typeorm";
import { ECreatedBy, ERoleScrope } from "../enums/account.enum";
import { IAccount } from "../types/common.types";

export class ScopeConditionCreatedByUtil {
    static getScopeConditions(account: IAccount): any {

        if (account.roleScope === ERoleScrope.TENANT) {
            return [
                {
                    createdBy: ECreatedBy.AGENCY,
                    agencyId: account.agencyId,
                },
                {
                    createdBy: ECreatedBy.TENANT,
                    tenantId: account.tenantId,
                }
            ];
        }


        if (account.roleScope === ERoleScrope.AGENCY) {
            return {
                createdBy: ECreatedBy.AGENCY,
                agencyId: account.agencyId,
            };
        }

        return {};
    }




    static getConditionsWithId(id: string, account: IAccount): any[] {
        const scope = this.getScopeConditions(account);
        if (Array.isArray(scope)) {
            return scope.map(s => ({ ...s, id }));
        }
        return { ...scope, id };
    }

}