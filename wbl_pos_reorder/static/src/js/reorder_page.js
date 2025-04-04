/** @odoo-module */
import { registry } from "@web/core/registry";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { formatDateTime, parseDateTime } from "@web/core/l10n/dates";
import { SearchBar } from "@point_of_sale/app/screens/ticket_screen/search_bar/search_bar";
import { patch } from "@web/core/utils/patch";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { parseUTCString } from "@point_of_sale/utils";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { OrderWidget } from "@point_of_sale/app/generic_components/order_widget/order_widget";
import { fuzzyLookup } from "@web/core/utils/search";
import { Component, onMounted, onWillStart, useState, reactive, useEffect } from "@odoo/owl";
import { useTrackedAsync } from "@point_of_sale/app/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PartnerLine } from "@point_of_sale/app/screens/partner_list/partner_line/partner_line";
import { ReorderPopup } from "./reorder_popup";


const NBR_BY_PAGE = 30;


export class ReorderPage extends Component {
    static storeOnOrder = false;
    static template = "wbl_reorder_module.ReorderPage";
    static props = [
        "close",
        "partner",
        "isSelected",
        "isBalanceDisplayed",
        "onClickEdit",
        "onClickUnselect",
        "onClickOrders",
        "onClickReorders",
        "ProductScreen",
        "onClickPartner",
        "Orderline",

    ];
    static components = {
        SearchBar,
        Orderline,
        OrderWidget,
    };

    static props = {
        destinationOrder: { type: Object, optional: true },
        reuseSavedUIState: { type: Boolean, optional: true },
        stateOverride: { type: Object, optional: true },
        onFilterSelected: { type: Function, optional: true },
        onSearch: { type: Function, optional: true },
        config: { type: Object, optional: true, default: () => ({ key: 'value' }) },
        placeholder: { type: String, optional: true, default: 'Search here...' },
    };

    static defaultProps = {
        destinationOrder: null,
        reuseSavedUIState: false,
        ui: {},
    };

    setup() {
        super.setup();
        this.pos = usePos();
        this.state = useState({
            page: 1,
            nbrPage: 1,
            filter: null,
            search: this.pos.getDefaultSearchDetails(),
            selectedOrderUuid: this.pos.get_order()?.uuid || null,
            selectedOrderlineIds: {},
        });
        this.dialog = useService("dialog");
        Object.assign(this.state, this.props.stateOverride || {});
        onMounted(this.onMounted);

     }


    setSelectedOrder(order) {
        this.state.selectedOrderUuid = order?.uuid || null;
    }

    getSelectedOrderlineId() {
        if (this.getSelectedOrder()) {
            return this.state.selectedOrderlineIds[this.getSelectedOrder().id];
        }
    }

    async _setOrder(order) {
        if (this.pos.isOpenOrderShareable()) {
            await this.pos.syncAllOrders();
        }
        this.pos.set_order(order);
        this.closeTicketScreen();
    }


    _onClickSearchField(fieldName) {
        this.state.showSearchFields = false;
        this.props.onSearch({ fieldName, searchTerm: this.state.searchInput });
    }

    getNbrPages() {
        return Math.ceil(this.pos.ticketScreenState.totalCount / NBR_BY_PAGE);
    }



    _getSearchFields() {
        const fields = {
            TRACKING_NUMBER: {
                repr: (order) => order.tracking_number,
                displayName: _t("Order Number"),
                modelField: "tracking_number",
            },
            RECEIPT_NUMBER: {
                repr: (order) => order.pos_reference,
                displayName: _t("Receipt Number"),
                modelField: "pos_reference",
            },
            DATE: {
                repr: (order) => this.getDate(order),
                displayName: _t("Date"),
                modelField: "date_order",
                formatSearch: (searchTerm) => {
                    const includesTime = searchTerm.includes(":");
                    let parsedDateTime;
                    try {
                        parsedDateTime = parseDateTime(searchTerm);
                    } catch {
                        return searchTerm;
                    }
                    if (includesTime) {
                        return parsedDateTime.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
                    } else {
                        return parsedDateTime.toFormat("yyyy-MM-dd");
                    }
                },
            },
            PARTNER: {
                repr: (order) => order.get_partner_name(),
                displayName: _t("Customer"),
                modelField: "partner_id.complete_name",
            },
        };

        if (this.showCardholderName()) {
            fields.CARDHOLDER_NAME = {
                repr: (order) => order.get_cardholder_name(),
                displayName: _t("Cardholder Name"),
                modelField: "payment_ids.cardholder_name",
            };
        }

        return fields;
    }
    _getFilterOptions() {
        const orderStates = this._getOrderStates();
        orderStates.set("SYNCED", { text: _t("Paid") });
        return orderStates;
    }

    showCardholderName() {
       return this.pos.models["pos.payment.method"].some((method) => method.use_payment_terminal);
    }

    onMounted() {
        setTimeout(() => {
            // Show updated list of synced orders when going back to the screen.
            this.onFilterSelected(this.state.filter);
        });
    }

    async onFilterSelected(selectedFilter) {
        this.state.filter = selectedFilter;

        if (this.state.filter == "SYNCED") {
            await this._fetchSyncedOrders();
        }
    }

    async onNextPage() {
        if (this.state.page < this.getNbrPages()) {
            this.state.page += 1;
            await this._fetchSyncedOrders();
        }
    }

    async onPrevPage() {
        if (this.state.page > 1) {
            this.state.page -= 1;
            await this._fetchSyncedOrders();
        }
    }

    _getOrderStates() {
        // We need the items to be ordered, therefore, Map is used instead of normal object.
        const states = new Map();
        states.set("ACTIVE_ORDERS", {
            text: _t("All active orders"),
        });
        // The spaces are important to make sure the following states
        // are under the category of `All active orders`.
        states.set("ONGOING", {
            text: _t("Ongoing"),
            indented: true,
        });
        states.set("PAYMENT", {
            text: _t("Payment"),
            indented: true,
        });
        states.set("RECEIPT", {
            text: _t("Receipt"),
            indented: true,
        });
        return states;
    }

    async onSearch(search) {
        this.state.search = search;
        this.state.page = 1;
        if (this.state.filter == "SYNCED") {
            await this._fetchSyncedOrders();
        }
    }

    closeTicketScreen() {
        this.pos.showScreen("ProductScreen");
    }


    getSearchBarConfig() {
        if (!this.state) {
            console.error("State is undefined");
            return {};
        }

        return {
            searchFields: new Map(
                Object.entries(this._getSearchFields()).map(([key, val]) => [key, val.displayName])
            ),
            filter: { show: true, options: this._getFilterOptions() },
            defaultSearchDetails: this.state.search,
            defaultFilter: this.state.filter,
        };

    }

    activeOrderFilter(o) {
        const screen = ["ReceiptScreen", "TipScreen"];
        const oScreen = o.get_screen_data();
        return (!o.finalized || screen.includes(oScreen.name)) && o.uiState.displayed;
    }

    getFilteredOrderList() {
        const orderModel = this.pos.models["pos.order"];
        let orders =
            this.state.filter === "SYNCED"
                ? orderModel.filter((o) => o.finalized && o.uiState.displayed)
                : orderModel.filter(this.activeOrderFilter);

        if (this.state.filter && !["ACTIVE_ORDERS", "SYNCED"].includes(this.state.filter)) {
            orders = orders.filter((order) => {
                const screen = order.get_screen_data();
                return this._getScreenToStatusMap()[screen.name] === this.state.filter;
            });
        }

        if (this.state.search.searchTerm) {
            const repr = this._getSearchFields()[this.state.search.fieldName].repr;
            orders = fuzzyLookup(this.state.search.searchTerm, orders, repr);
        }

        const sortOrders = (orders, ascending = false) =>
            orders.sort((a, b) => {
                const dateA = parseUTCString(a.date_order, "yyyy-MM-dd HH:mm:ss");
                const dateB = parseUTCString(b.date_order, "yyyy-MM-dd HH:mm:ss");

                if (a.date_order !== b.date_order) {
                    return ascending ? dateA - dateB : dateB - dateA;
                } else {
                    const nameA = parseInt(a.name.replace(/\D/g, "")) || 0;
                    const nameB = parseInt(b.name.replace(/\D/g, "")) || 0;
                    return ascending ? nameA - nameB : nameB - nameA;
                }
            });

        if (this.state.filter === "SYNCED") {
            return sortOrders(orders).slice(
                (this.state.page - 1) * NBR_BY_PAGE,
                this.state.page * NBR_BY_PAGE
            );
        } else {
            return sortOrders(orders, true);
        }
    }

    _getScreenToStatusMap() {
        return {
            ProductScreen: "ONGOING",
            PaymentScreen: "PAYMENT",
            ReceiptScreen: "RECEIPT",
        };
    }

    getPageNumber() {
        if (!this.pos.ticketScreenState.totalCount) {
            return `1/1`;
        } else {
            return `${this.state.page}/${this.getNbrPages()}`;
        }
    }

    getTotal(order) {
        return this.env.utils.formatCurrency(order.get_total_with_tax());
    }
    getPartner(order) {
        return order.get_partner_name();
    }
    getCardholderName(order) {
        return order.get_cardholder_name();
    }
    getCashier(order) {
        return order.employee_id ? order.employee_id.name : "";
    }
    getStatus(order) {
        if (
            order.uiState?.locked &&
            (order.get_screen_data().name === "" || this.state.filter === "SYNCED")
        ) {
            return _t("Paid");
        } else {
            const screen = order.get_screen_data();
            return this._getOrderStates().get(this._getScreenToStatusMap()[screen.name])?.text;
        }
    }

    get isOrderSynced() {
        return (
            this.getSelectedOrder()?.uiState.locked &&
            (this.getSelectedOrder().get_screen_data().name === "" ||
                this.state.filter === "SYNCED")
        );
    }

    async _fetchSyncedOrders() {
        const screenState = this.pos.ticketScreenState;
        const domain = this._computeSyncedOrdersDomain();
        const offset = screenState.offsetByDomain[JSON.stringify(domain)] || 0;
        const config_id = this.pos.config.id;
        const { ordersInfo, totalCount } = await this.pos.data.call(
            "pos.order",
            "search_paid_order_ids",
            [],
            {
                config_id,
                domain,
                limit: 30,
                offset,
            }
        );

        if (!screenState.offsetByDomain[JSON.stringify(domain)]) {
            screenState.offsetByDomain[JSON.stringify(domain)] = 0;
        }
        screenState.offsetByDomain[JSON.stringify(domain)] += ordersInfo.length;
        screenState.totalCount = totalCount;

        const idsNotInCacheOrOutdated = ordersInfo
            .filter((orderInfo) => {
                const order = this.pos.models["pos.order"].get(orderInfo[0]);

                if (order && parseUTCString(orderInfo[1]) > parseUTCString(order.date_order)) {
                    return true;
                }

                return !order;
            })
            .map((info) => info[0]);

        if (idsNotInCacheOrOutdated.length > 0) {
            await this.pos.data.read("pos.order", Array.from(new Set(idsNotInCacheOrOutdated)));
        }
    }

    _computeSyncedOrdersDomain() {
        let { fieldName, searchTerm } = this.state.search;
        if (!searchTerm) {
            return [];
        }
        const searchField = this._getSearchFields()[fieldName];
        if (searchField && searchField.modelField && searchField.modelField !== null) {
            if (searchField.formatSearch) {
                searchTerm = searchField.formatSearch(searchTerm);
            }
            return [[searchField.modelField, "ilike", `%${searchTerm}%`]];
        } else {
            return [];
        }
    }

    isHighlighted(order) {
        const selectedOrder = this.getSelectedOrder();
        return selectedOrder ? order.id && order.id == selectedOrder.id : false;
    }

    getSelectedOrder() {
        return this.pos.models["pos.order"].getBy("uuid", this.state.selectedOrderUuid) || null;
    }

    shouldHideDeleteButton(order) {
        const orders = this.pos.models["pos.order"].filter((o) => !o.finalized);
        return (
            (orders.length === 1 && orders[0].lines.length === 0) ||
            (order != this.getSelectedOrder()) ||
            this.isDefaultOrderEmpty(order) ||
            order.finalized ||
            order.payment_ids.some(
                (payment) => payment.is_electronic() && payment.get_payment_status() === "done"
            ) ||
            order.finalized
        );
    }

    isDefaultOrderEmpty(order) {
        const status = this._getScreenToStatusMap()[order.get_screen_data().name];
        const productScreenStatus = this._getScreenToStatusMap().ProductScreen;
        return (
            order.get_orderlines().length === 0 &&
            this.pos.get_open_orders().length === 1 &&
            status === productScreenStatus &&
            order.payment_ids.length === 0
        );
    }

    onSearchInputKeydown(event) {
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
        }
    }

    _onClickSearchField(fieldName) {
        this.state.showSearchFields = false;
        this.props.onSearch({ fieldName, searchTerm: this.state.searchInput });
    }

    onSearchInputKeyup(event) {
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            this.state.selectedSearchFieldId = this._fieldIdToSelect(event.key);
        } else if (event.key === "Enter" || this.state.searchInput == "") {
            this._onClickSearchField(this.searchFieldsList[this.state.selectedSearchFieldId]);
        } else {
            if (this.state.selectedSearchFieldId === -1 && this.searchFieldsList.length) {
                this.state.selectedSearchFieldId = 0;
            }
            this.state.showSearchFields = true;
        }
    }

    _onSelectFilter(key) {
        this.state.selectedFilter = key;
        this.props.onFilterSelected(this.state.selectedFilter);
    }
    getDate(order) {
        return formatDateTime(parseUTCString(order.date_order));
    }
    get currentOrder() {
        return this.pos.get_order();
    }

    reorderProductPage(order){
            this.dialog.add(ReorderPopup,{ order });
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

    }

}

registry.category("pos_screens").add("ReorderPage", ReorderPage);