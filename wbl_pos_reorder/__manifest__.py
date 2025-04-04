# -*- coding: utf-8 -*-
#
#################################################################################
# Author      : Weblytic Labs Pvt. Ltd. (<https://store.weblyticlabs.com/>)
# Copyright(c): 2023-Present Weblytic Labs Pvt. Ltd.
# All Rights Reserved.
#
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
##################################################################################

{
    'name': 'POS Reorder',
    'version': '18.0.1.0.0',
    'sequence': -1,
    'summary': """This is a reorde module""",
    'description': """This is my first module""",
    'category': 'eCommerce',
    'author': 'Weblytic Labs',
    'company': 'Weblytic Labs',
    'website': "https://store.weblyticlabs.com",
    'depends': ['base', 'point_of_sale', 'pos_restaurant', 'web', 'account', 'sale_management'],
    # 'images': ['static/description/banner.gif'],
    'license': 'OPL-1',
    'installable': True,
    'auto_install': False,
    'application': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'wbl_pos_reorder/static/src/xml/reorder_page.xml',
            'wbl_pos_reorder/static/src/xml/partner_list.xml',
            'wbl_pos_reorder/static/src/js/reorder_page.js',
            'wbl_pos_reorder/static/src/js/reorder_popup.js',
            'wbl_pos_reorder/static/src/xml/reorder_button.xml',
            'wbl_pos_reorder/static/src/js/partner_line.js',
            'wbl_pos_reorder/static/src/js/partner_list.js',
        ],
    }
}
