"""靜態板塊標籤。板塊標籤不代表即時資金流。"""

CRYPTO_SECTOR_TAGS = {
    "BTC": ["核心大幣", "價值儲藏"], "ETH": ["核心大幣", "DeFi"], "BNB": ["核心大幣", "交易所"],
    "SOL": ["L1/L2", "SOL生態"], "XRP": ["支付/老幣", "核心大幣"], "ADA": ["L1/L2", "核心大幣"],
    "TRX": ["支付/老幣", "L1/L2"], "LTC": ["支付/老幣", "價值儲藏"], "BCH": ["支付/老幣", "BTC生態"],
    "LINK": ["Oracle/Data", "DeFi"], "AVAX": ["L1/L2", "DeFi"], "DOT": ["L1/L2", "跨鏈"],
    "ATOM": ["L1/L2", "跨鏈"], "SUI": ["L1/L2", "新公鏈"], "APT": ["L1/L2", "新公鏈"],
    "NEAR": ["L1/L2", "AI"], "SEI": ["L1/L2", "交易"], "STRK": ["L1/L2", "ZK"],
    "ARB": ["L1/L2", "DeFi"], "OP": ["L1/L2", "Superchain"], "POL": ["L1/L2", "Polygon"],
    "S": ["L1/L2", "Sonic"], "TIA": ["L1/L2", "模組化"], "EGLD": ["L1/L2", "支付"],
    "ETC": ["支付/老幣", "PoW"], "HBAR": ["L1/L2", "企業鏈"], "ALGO": ["L1/L2", "支付"],
    "KAVA": ["L1/L2", "DeFi"], "INJ": ["交易所/合約", "DeFi"], "HYPE": ["交易所/合約", "L1/L2"],
    "OKB": ["交易所/合約", "平台幣"], "DYDX": ["交易所/合約", "DeFi"], "GMX": ["交易所/合約", "DeFi"],
    "AAVE": ["DeFi", "借貸"], "UNI": ["DeFi", "DEX"], "CRV": ["DeFi", "DEX"], "SUSHI": ["DeFi", "DEX"],
    "1INCH": ["DeFi", "DEX聚合"], "CAKE": ["DeFi", "DEX"], "COMP": ["DeFi", "借貸"], "YFI": ["DeFi", "收益"],
    "PENDLE": ["DeFi", "收益"], "LDO": ["DeFi", "LSD"], "RPL": ["DeFi", "LSD"], "SNX": ["DeFi", "衍生品"],
    "RUNE": ["DeFi", "跨鏈"], "RAY": ["SOL生態", "DeFi"], "JUP": ["SOL生態", "DeFi"], "JTO": ["SOL生態", "LSD"],
    "PYTH": ["Oracle/Data", "SOL生態"], "ONDO": ["RWA", "DeFi"], "ENA": ["DeFi", "穩定幣"],
    "TAO": ["AI", "DePIN"], "KAITO": ["AI", "InfoFi"], "WLD": ["AI", "身份"], "GRT": ["Oracle/Data", "AI"],
    "GLM": ["DePIN", "AI"], "ICP": ["AI", "L1/L2"], "FIL": ["DePIN", "Storage"], "FLR": ["Oracle/Data", "L1/L2"],
    "VET": ["RWA", "供應鏈"], "PAXG": ["價值儲藏", "RWA"], "STX": ["BTC生態", "L1/L2"], "ORDI": ["BTC生態", "銘文"],
    "KAS": ["PoW", "L1/L2"], "ZEC": ["隱私幣", "PoW"], "ROSE": ["隱私幣", "L1/L2"],
    "DOGE": ["Meme", "核心大幣"], "SHIB": ["Meme", "ETH生態"], "PEPE": ["Meme", "ETH生態"],
    "FLOKI": ["Meme", "多鏈"], "BOME": ["Meme", "SOL生態"], "PENGU": ["Meme", "SOL生態"],
    "TRUMP": ["Meme", "SOL生態"], "MEME": ["Meme"], "WIF": ["Meme", "SOL生態"], "BONK": ["Meme", "SOL生態"],
    "MANA": ["GameFi", "元宇宙"], "SAND": ["GameFi", "元宇宙"], "GALA": ["GameFi"], "AXS": ["GameFi"],
    "IMX": ["GameFi", "L1/L2"], "ENJ": ["GameFi"], "CHZ": ["支付/老幣", "Fan Token"],
    "LPT": ["DePIN", "影音"], "LRC": ["L1/L2", "DEX"], "RSR": ["支付/老幣", "穩定幣"],
    "ASTER": ["交易所/合約", "DeFi"], "W": ["跨鏈", "Oracle/Data"],
}

# Pionex 每日同步的分類來源是 spot_markets / future_markets 裡的 us_stock_sec_* tags。
# 這裡只負責把 Pionex tag 翻成主頁顯示文字；不再用這個檔案決定某支美股屬於哪個板塊。
# 若 Pionex 未來新增未知 tag，仍會顯示 tag 後綴，不會退回「美股代幣」。
PIONEX_SECTOR_TAG_LABELS = {
    "us_stock_sec_bank": "銀行",
    "us_stock_sec_chinese": "中概股",
    "us_stock_sec_commodities": "大宗商品",
    "us_stock_sec_consumer": "消費",
    "us_stock_sec_crypto": "加密概念",
    "us_stock_sec_energy_storage": "儲能",
    "us_stock_sec_etf": "ETF",
    "us_stock_sec_hot": "熱門",
    "us_stock_sec_industry": "行業指數",
    "us_stock_sec_military": "軍工",
    "us_stock_sec_nas_100": "NASDAQ 100",
    "us_stock_sec_nuclear": "核能",
    "us_stock_sec_oil": "石油",
    "us_stock_sec_pharmaceuticals": "生物科技/醫藥",
    "us_stock_sec_phlx_semi": "費城半導體",
    "us_stock_sec_quantum": "量子計算",
    "us_stock_sec_rare_earth": "稀土",
    "us_stock_sec_real_estate": "房地產",
    "us_stock_sec_semi": "半導體",
    "us_stock_sec_space": "航太/太空",
    "us_stock_sec_us_500": "S&P 500",
}

# 顯示時讓「真正題材/產業」優先，指數成分與熱門標籤放後面。
PIONEX_SECTOR_TAG_PRIORITY = [
    "us_stock_sec_military",
    "us_stock_sec_space",
    "us_stock_sec_nuclear",
    "us_stock_sec_oil",
    "us_stock_sec_energy_storage",
    "us_stock_sec_rare_earth",
    "us_stock_sec_quantum",
    "us_stock_sec_semi",
    "us_stock_sec_phlx_semi",
    "us_stock_sec_pharmaceuticals",
    "us_stock_sec_bank",
    "us_stock_sec_consumer",
    "us_stock_sec_real_estate",
    "us_stock_sec_crypto",
    "us_stock_sec_chinese",
    "us_stock_sec_commodities",
    "us_stock_sec_industry",
    "us_stock_sec_etf",
    "us_stock_sec_nas_100",
    "us_stock_sec_us_500",
    "us_stock_sec_hot",
]


def normalize_pionex_sector_tag(tag: str) -> str:
    value = str(tag or "").strip().lower()
    if value.startswith("sys_spot_"):
        value = value[len("sys_spot_"):]
    return value if value.startswith("us_stock_sec_") else ""


def pionex_sector_tags_from_tags(*tag_groups) -> list[str]:
    found = set()
    for group in tag_groups:
        for raw in (group or []):
            tag = normalize_pionex_sector_tag(raw)
            if tag:
                found.add(tag)
    priority = {tag: index for index, tag in enumerate(PIONEX_SECTOR_TAG_PRIORITY)}
    return sorted(found, key=lambda tag: (priority.get(tag, 10_000), tag))


def pionex_sector_labels_from_tags(*tag_groups) -> list[str]:
    labels = []
    for tag in pionex_sector_tags_from_tags(*tag_groups):
        label = PIONEX_SECTOR_TAG_LABELS.get(tag)
        if not label:
            # Pionex 新增 tag 時仍然直接跟進，不再顯示成泛稱「美股代幣」。
            label = tag.removeprefix("us_stock_sec_").replace("_", " ").strip().title()
        if label and label not in labels:
            labels.append(label)
    return labels


# 下方逐股表只保留為 R2 / Pionex 暫時不可用時的 fallback。正常主頁不再以它作為美股分類來源。
RWA_SECTOR_TAGS = {
    'AAOIX': ['半導體晶片'],
    'AAPLX': ['美股代幣'],
    'AAX': ['美股代幣'],
    'ALABX': ['半導體晶片'],
    'AMATX': ['半導體晶片'],
    'AMDX': ['半導體晶片'],
    'AMZNX': ['美股代幣'],
    'ANTHROPIC': ['美股代幣'],
    'APPX': ['美股代幣'],
    'ARMX': ['半導體晶片'],
    'ASMLX': ['半導體晶片'],
    'ASTSX': ['美股代幣'],
    'AVGOX': ['半導體晶片'],
    'AXTIX': ['半導體晶片'],
    'BEX': ['美股代幣'],
    'BMNRX': ['美股代幣'],
    'BNOX': ['石油'],
    'BRENTOIL': ['石油'],
    'CBRS': ['美股代幣'],
    'CEGX': ['能源'],
    'CF': ['美股代幣'],
    'CIFRX': ['美股代幣'],
    'WTI': ['石油'],
    'COHRX': ['半導體晶片'],
    'COINX': ['美股代幣'],
    'COPPER': ['美股代幣'],
    'CPERX': ['美股代幣'],
    'CRCLX': ['美股代幣'],
    'CRDOX': ['半導體晶片'],
    'CRWVX': ['美股代幣'],
    'CSCOX': ['美股代幣'],
    'CVXX': ['能源'],
    'DELLX': ['美股代幣'],
    'DRAMX': ['半導體晶片', '儲存'],
    'EWJX': ['美股代幣'],
    'EWYX': ['美股代幣'],
    'FLNCX': ['美股代幣'],
    'GEVX': ['能源'],
    'GLWX': ['美股代幣'],
    'GMEX': ['美股代幣'],
    'GOOGLX': ['美股代幣'],
    'GSGX': ['美股代幣'],
    'HIMSX': ['美股代幣'],
    'HOODX': ['美股代幣'],
    'HPEX': ['美股代幣'],
    'HYUNDAI': ['美股代幣'],
    'IBMX': ['美股代幣'],
    'INTCX': ['半導體晶片'],
    'IRENX': ['美股代幣'],
    'KLACX': ['半導體晶片'],
    'LITEX': ['稀土'],
    'LLYX': ['美股代幣'],
    'LMTX': ['美股代幣'],
    'LNGX': ['能源'],
    'LRCXX': ['半導體晶片'],
    'METAX': ['美股代幣'],
    'MOSX': ['美股代幣'],
    'MPX': ['稀土'],
    'MRVLX': ['半導體晶片'],
    'MSFTX': ['美股代幣'],
    'MSTRX': ['美股代幣'],
    'MUX': ['美股代幣'],
    'NATGAS': ['能源'],
    'NBISX': ['美股代幣'],
    'NFLXX': ['美股代幣'],
    'NKEX': ['美股代幣'],
    'NOKX': ['美股代幣'],
    'NOWX': ['美股代幣'],
    'NTRX': ['美股代幣'],
    'NVDAX': ['半導體晶片'],
    'OKLOX': ['美股代幣'],
    'ONDSX': ['美股代幣'],
    'ONX': ['半導體晶片'],
    'OPENAI': ['美股代幣'],
    'ORCLX': ['美股代幣'],
    'PAYPX': ['美股代幣'],
    'PLTRX': ['美股代幣'],
    'QCOMX': ['半導體晶片'],
    'QNTX': ['量子計算'],
    'QQQX': ['美股代幣'],
    'RGTIX': ['量子計算'],
    'RKLBX': ['美股代幣'],
    'RTXX': ['美股代幣'],
    'SITMX': ['半導體晶片'],
    'SKHX': ['半導體晶片', '儲存'],
    'SKHY': ['半導體晶片', '儲存'],
    'SLVX': ['美股代幣'],
    'SMCIX': ['半導體晶片'],
    'SMHX': ['半導體晶片'],
    'SMSN': ['半導體晶片'],
    'SNDKX': ['半導體晶片', '儲存'],
    'SNXXX': ['美股代幣'],
    'SOXLX': ['半導體晶片'],
    'SOXXX': ['半導體晶片'],
    'SPCX': ['美股代幣'],
    'SPYX': ['美股代幣'],
    'STXX': ['儲存'],
    'TQQQX': ['美股代幣'],
    'TSLAX': ['美股代幣'],
    'TSMX': ['半導體晶片'],
    'TTEX': ['美股代幣'],
    'TXNX': ['半導體晶片'],
    'UNGX': ['能源'],
    'UNHX': ['美股代幣'],
    'URAX': ['能源'],
    'URNMX': ['能源'],
    'USARX': ['稀土'],
    'USOX': ['石油'],
    'VGKX': ['美股代幣'],
    'VSHX': ['美股代幣'],
    'WDCX': ['半導體晶片', '儲存'],
    'XAG': ['美股代幣'],
    'XAU': ['美股代幣'],
    'XPD': ['美股代幣'],
    'XPT': ['美股代幣'],
    'XYZX': ['美股代幣'],
    'KIOXIA': ['半導體晶片', '儲存'],
    'PANWX': ['美股代幣'],
    'SHAZX': ['美股代幣'],
    'SOXSX': ['半導體晶片'],
    'XLPX': ['美股代幣'],
    'XLVX': ['美股代幣'],
}

SECTOR_TAGS = {**CRYPTO_SECTOR_TAGS, **RWA_SECTOR_TAGS}


def get_sector_badge(symbol: str, max_tags: int = 2) -> str:
    tags = SECTOR_TAGS.get(str(symbol).upper(), ["未分類"])
    return " · ".join(tags[:max_tags])
