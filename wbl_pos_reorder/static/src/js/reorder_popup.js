import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useState } from "@odoo/owl";
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";


export class ReorderPopup extends Component {
    static template = "wbl_reorder_module.ReorderAllProduct";
    static components = { Dialog };
    static props = ["close",'order'];

    setup() {
            this.pos = usePos();
    }

    ReorderParticularProduct(orderline){
        var order = orderline.order_id;
            const partner = order.get_partner();

            // Ensure that the destinationOrder is valid and meets the necessary conditions
            const destinationOrder =
                this.props.destinationOrder &&
                this.props.destinationOrder.lines.every(
                    (l) =>
                        l.quantity >= 0 || order.lines.some((ol) => ol.id === l.reordered_orderline_id)
                ) &&
                partner === this.props.destinationOrder.get_partner() &&
                !this.pos.preventReorderAndSales()
                    ? this.props.destinationOrder
                    : this._getNewOrder(partner);

            destinationOrder.takeaway = order.takeaway;

            // Filter the lines to include only the selected order line (reordered one)
            const lines = [];
            const reorderLine = order.lines.find(l => l.id === orderline.id); // Find the specific order line being reordered
            if (reorderLine) {
                const line = this.pos.models["pos.order.line"].create({
                    qty: reorderLine.qty,
                    price_unit: reorderLine.price_unit,
                    product_id: reorderLine.product_id,
                    order_id: destinationOrder,
                    discount: reorderLine.discount,
                    tax_ids: reorderLine.tax_ids.map((tax) => ["link", tax]),
                    reordered_orderline_id: reorderLine.id,
                    pack_lot_ids: reorderLine.pack_lot_ids.map((packLot) => ["link", packLot]),
                    price_type: "automatic",
                });
                lines.push(line);
                reorderLine.destination_order_uuid = destinationOrder.uuid;
            }

            this.setPartnerToReorderOrder(partner, destinationOrder);
            this.pos.showScreen("ProductScreen");
            this.props.close();
    }
    _getNewOrder(partner) {
    let newOrderForPartner = null;
    let newOrder = null;
    for (const order of this.pos.models["pos.order"].filter((order) => !order.finalized)) {
        if (order.get_orderlines().length === 0 && order.payment_ids.length === 0) {
            if (order.get_partner() === partner) {
                newOrderForPartner = order;
                break;
            } else if (!order.get_partner() && newOrder === null) {
                newOrder = order;
            }
        }
    }
    return newOrderForPartner || newOrder || this.pos.add_new_order();
}
    setPartnerToReorderOrder(partner, destinationOrder) {
        if (partner && !destinationOrder.get_partner()) {
            destinationOrder.set_partner(partner);
        }
    }
    closeReorderScreen() {
        this.pos.closeScreen();

    }

    getPartner(order) {
        return order.get_partner_name();

    }

    allProductReorder(orderdata) {
        const order = orderdata;
        const partner = order.get_partner();

        const destinationOrder =
            this.props.destinationOrder &&
            this.props.destinationOrder.lines.every(
                (l) =>
                    l.quantity >= 0 || order.lines.some((ol) => ol.id === l.reordered_orderline_id)
            ) &&
            partner === this.props.destinationOrder.get_partner() &&
            !this.pos.preventReorderAndSales()
                ? this.props.destinationOrder
                : this._getNewOrder(partner);

        destinationOrder.takeaway = order.takeaway;
        const lines = [];
        for (const reorderDetail of order.lines) {
            const reorderLine = reorderDetail;
            const line = this.pos.models["pos.order.line"].create({
                qty: reorderDetail.qty,
                price_unit: reorderLine.price_unit,
                product_id: reorderLine.product_id,
                order_id: destinationOrder,
                discount: reorderLine.discount,
                tax_ids: reorderLine.tax_ids.map((tax) => ["link", tax]),
                reordered_orderline_id: reorderLine,
                pack_lot_ids: reorderLine.pack_lot_ids.map((packLot) => ["link", packLot]),
                price_type: "automatic",
            });

            lines.push(line);
            reorderDetail.destination_order_uuid = destinationOrder.uuid;
        }
        this.setPartnerToReorderOrder(partner, destinationOrder);
        this.closeReorderScreen();
        this.props.close();

    }

}
