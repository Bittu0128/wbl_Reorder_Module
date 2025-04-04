import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { patch } from "@web/core/utils/patch";
import { Component, xml } from "@odoo/owl";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";

patch(PartnerList.prototype, {

    setup(){
        super.setup();
        this.pos = usePos();
    },

    goToReorders(partner) {
        this.props.close();
        const stateOverride = {
            search: {
                fieldName: "PARTNER",
                searchTerm: partner.name,
            },
            filter: "SYNCED",
        };
        this.pos.showScreen("ReorderPage", { stateOverride });
    }


});
