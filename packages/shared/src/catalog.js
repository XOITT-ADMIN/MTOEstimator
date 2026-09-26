// GENERATED FILE — do not hand-edit. Run `npm run catalog` after changing assets/MTO_Template.xlsx.
//
// Mirrors the workbook's master tabs and the dropdown/lookup rules on its two MTO sheets:
//   · plumbing.materials   = whole Material Master (Plumbing MTO col D validation)
//   · electrical.materials = Material Master rows 10–17 only (Electrical MTO col D validation)
//   · <trade>.items[family][].unit is the Default Unit the sheet looks up per item (Unit column formula)
//   · needsSecondarySize (reducers) / needsCore (cables) mark which optional column the sheet
//     expects for that item; the column itself is available for every row, as in the sheet.

export const CATALOG = {
  "plumbing": {
    "families": [
      "Pipe",
      "Pipe Fitting",
      "Flange",
      "Valve",
      "Flexible Connector",
      "Pipe Support",
      "Fastener",
      "Jointing Material"
    ],
    "items": {
      "Pipe": [
        {
          "name": "Pipe",
          "unit": "m",
          "needsSecondarySize": false
        },
        {
          "name": "Braided Hose",
          "unit": "m",
          "needsSecondarySize": false
        },
        {
          "name": "DWC Pipe",
          "unit": "m",
          "needsSecondarySize": false
        },
        {
          "name": "Perforated Drain Pipe",
          "unit": "m",
          "needsSecondarySize": false
        }
      ],
      "Pipe Fitting": [
        {
          "name": "45° Elbow",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "90° Elbow",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Equal Tee",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Reducing Tee",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Equal Cross",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Concentric Reducer",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Eccentric Reducer",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Reducer Bush",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Coupling",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Reducing Coupling",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Union",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Male Adaptor",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Female Adaptor",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Threaded Adaptor",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Flange Adaptor",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "End Cap",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pipe Plug",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Repair Clamp",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Service Saddle",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Socket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Reducer Socket",
          "unit": "Nos",
          "needsSecondarySize": true
        },
        {
          "name": "Threaded Tee",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Threaded Elbow",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Bulkhead Union",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Compression Coupling",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Compression Tee",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Compression Elbow",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Stub End",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Backing Ring",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Repair Coupling",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Mechanical Coupling",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Flange": [
        {
          "name": "Slip-On Flange",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Blind Flange",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Weld Neck Flange",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Threaded Flange",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Lap Joint Flange",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Valve": [
        {
          "name": "Butterfly Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Ball Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Gate Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Globe Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Check Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Knife Gate Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Air Release Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Foot Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Y Strainer",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pressure Reducing Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pressure Relief Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Needle Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Sampling Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Float Valve",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Flexible Connector": [
        {
          "name": "Rubber Expansion Joint",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Dismantling Joint",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Pipe Support": [
        {
          "name": "U Clamp",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pipe Clamp",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pipe Shoe",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Pipe Hanger",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "U Bolt",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Channel Support",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Anchor Bracket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Guide Support",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Fastener": [
        {
          "name": "Hex Bolt",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Hex Nut",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Plain Washer",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Spring Washer",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Stud Bolt",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Anchor Bolt",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Foundation Bolt",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Lock Nut",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ],
      "Jointing Material": [
        {
          "name": "PTFE Tape",
          "unit": "Roll",
          "needsSecondarySize": false
        },
        {
          "name": "Solvent Cement",
          "unit": "Tin",
          "needsSecondarySize": false
        },
        {
          "name": "Thread Sealant",
          "unit": "Tube",
          "needsSecondarySize": false
        },
        {
          "name": "Rubber Gasket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "Spiral Wound Gasket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "PVC Primer",
          "unit": "Tin",
          "needsSecondarySize": false
        },
        {
          "name": "EPDM Gasket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "NBR Gasket",
          "unit": "Nos",
          "needsSecondarySize": false
        },
        {
          "name": "CAF Gasket",
          "unit": "Nos",
          "needsSecondarySize": false
        }
      ]
    },
    "materials": [
      "PVC",
      "UPVC",
      "CPVC",
      "HDPE",
      "PP",
      "DI",
      "CI",
      "CS",
      "SS304",
      "SS316",
      "GI",
      "Brass",
      "Copper",
      "Aluminium",
      "Rubber",
      "Nylon"
    ],
    "sizes": [
      "15 mm",
      "20 mm",
      "25 mm",
      "32 mm",
      "40 mm",
      "50 mm",
      "63 mm",
      "75 mm",
      "90 mm",
      "100 mm",
      "110 mm",
      "125 mm",
      "150 mm",
      "160 mm",
      "200 mm",
      "250 mm",
      "300 mm",
      "DN50",
      "DN80",
      "DN100",
      "DN150",
      "1/2\"",
      "3/4\"",
      "1\"",
      "1 1/2\"",
      "2\"",
      "3\"",
      "4\""
    ]
  },
  "electrical": {
    "families": [
      "Power Cable",
      "Control Cable",
      "Instrument Cable",
      "Cable Management",
      "Conduit",
      "Cable Accessory",
      "Cable Termination",
      "Earthing",
      "Panel Accessory",
      "Electrical Accessory"
    ],
    "items": {
      "Power Cable": [
        {
          "name": "Power Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        },
        {
          "name": "Flexible Power Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        }
      ],
      "Control Cable": [
        {
          "name": "Control Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        },
        {
          "name": "Shielded Control Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        }
      ],
      "Instrument Cable": [
        {
          "name": "Instrumentation Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        },
        {
          "name": "Twisted Pair Instrument Cable",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": true
        }
      ],
      "Cable Management": [
        {
          "name": "Cable Tray",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Ladder",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Trunking",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Cover",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Coupler",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Bend",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Tee",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Reducer",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tray Riser",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Conduit": [
        {
          "name": "PVC Conduit",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "GI Conduit",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Flexible Conduit",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Conduit Bend",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Conduit Coupler",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Conduit Junction Box",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Cable Accessory": [
        {
          "name": "Cable Gland",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Double Compression Cable Gland",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Single Compression Cable Gland",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Lug",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Bimetallic Lug",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Ferrule",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Tie",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "SS Cable Tie",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Marker",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Heat Shrink Sleeve",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Cleat",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Cable Joint Kit",
          "unit": "Set",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Termination Kit",
          "unit": "Set",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "PVC Cable Marker",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "SS Cable Marker",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Cable Termination": [
        {
          "name": "Terminal Block",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Earth Terminal Block",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "DIN Rail",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Wire Duct",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Earthing": [
        {
          "name": "Earth Electrode",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Earth Busbar",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Earth Clamp",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Copper Bonded Earth Rod",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Earth Pit Chamber",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Earth Strip",
          "unit": "m",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Panel Accessory": [
        {
          "name": "Cooling Fan",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Thermostat",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Space Heater",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Door Limit Switch",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Panel Light",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Panel Socket",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ],
      "Electrical Accessory": [
        {
          "name": "Industrial Plug",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Industrial Socket",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "MCB",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "MCCB",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Selector Switch",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Push Button",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        },
        {
          "name": "Indication Lamp",
          "unit": "Nos",
          "needsSecondarySize": false,
          "needsCore": false
        }
      ]
    },
    "materials": [
      "SS304",
      "SS316",
      "GI",
      "Brass",
      "Copper",
      "Aluminium",
      "Rubber",
      "Nylon"
    ],
    "sizes": [
      "0.75 sq.mm",
      "1.5 sq.mm",
      "2.5 sq.mm",
      "4 sq.mm",
      "6 sq.mm",
      "10 sq.mm",
      "16 sq.mm",
      "25 sq.mm",
      "35 sq.mm",
      "50 sq.mm",
      "70 sq.mm",
      "95 sq.mm",
      "120 sq.mm",
      "20 mm",
      "25 mm",
      "32 mm",
      "40 mm",
      "50 mm",
      "M20",
      "M25",
      "M32",
      "100 mm",
      "150 mm",
      "300 mm",
      "450 mm",
      "600 mm"
    ],
    "cores": [
      "1C",
      "2C",
      "3C",
      "3.5C",
      "4C",
      "5C",
      "7C",
      "12C",
      "19C",
      "24C"
    ]
  },
  "materials": [
    "PVC",
    "UPVC",
    "CPVC",
    "HDPE",
    "PP",
    "DI",
    "CI",
    "CS",
    "SS304",
    "SS316",
    "GI",
    "Brass",
    "Copper",
    "Aluminium",
    "Rubber",
    "Nylon"
  ],
  "units": [
    "m",
    "Nos",
    "Roll",
    "Kg",
    "Tin",
    "Tube",
    "Set",
    "Litre"
  ]
};

export const TRADE_KEY = { Plumbing: "plumbing", Electrical: "electrical" };

export function tradeCatalog(trade) {
  return CATALOG[TRADE_KEY[trade] || trade] || CATALOG.plumbing;
}

// Flat list of every pickable item for a trade, in library order, each tagged with its family —
// the same flat list the sheet's Item dropdown shows.
export function tradeItems(trade) {
  const cat = tradeCatalog(trade);
  return cat.families.flatMap((family) => cat.items[family].map((it) => ({ ...it, family })));
}

export function findItem(trade, name) {
  return tradeItems(trade).find((it) => it.name === name) || null;
}

// Unit column equivalent of the sheet's INDEX/MATCH: derived from the item, never chosen.
export function unitFor(trade, name) {
  return findItem(trade, name)?.unit || "Nos";
}
