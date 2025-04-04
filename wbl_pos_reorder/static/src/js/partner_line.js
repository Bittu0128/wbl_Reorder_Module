import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { patch } from "@web/core/utils/patch";
import { PartnerLine } from "@point_of_sale/app/screens/partner_list/partner_line/partner_line";
import { Component, xml } from "@odoo/owl";


PartnerLine.props = [
    "close",
    "partner",
    "isSelected",
    "isBalanceDisplayed",
    "onClickEdit",
    "onClickUnselect",
    "onClickPartner",
    "onClickOrders",
    "onClickReorders",
];