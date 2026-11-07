import os, re, shutil, sys
SRC = sys.argv[1]
def sub(path, old, new):
    p = f'{SRC}/{path}'; s = open(p).read()
    assert old in s, (path, old[:50]); open(p, 'w').write(s.replace(old, new, 1))

sub('controllers/user.controller.js', 'const { hasPermission } = require("../middlewares/checkPermission");', 'const { hasPermission } = await import("../middlewares/checkPermission.js");')
for f in ('controllers/auth/forgotPasswordController.js', 'controllers/auth/resetPasswordController.js'):
    sub(f, "const { t } = require('../../utils/translate'); // Import translation function", "import { t } from '../../utils/translate.js';")
sub('routes/testRoutes.js', "const authenticate = require('../middlewares/authMiddleware');         // Middleware ya auth", "import authenticate from '../middlewares/authMiddleware.js';")
sub('utils/socket.js', '    const pool = require("../config/db");\n', '')
p = f'{SRC}/utils/socket.js'; s = open(p).read(); open(p, 'w').write("import pool from '../config/db.js';\n" + s)

p = f'{SRC}/services/ai/explain/ReportContextRegistry.js'; s = open(p).read()
s = re.sub(r"const adapters = \[[\s\S]*?\];", "import salesAdapter from './adapters/SalesReportContextAdapter.js';\nimport profitAdapter from './adapters/ProfitReportContextAdapter.js';\nimport inventoryAdapter from './adapters/InventoryReportContextAdapter.js';\nconst adapters = [salesAdapter, profitAdapter, inventoryAdapter];", s, count=1)
open(p, 'w').write(s)

p = f'{SRC}/services/ai/assistant/ToolRegistry.js'; s = open(p).read()
paths = re.findall(r"require\('\.\./tools/([^']+)'\)", s)
imports = '\n'.join(f"import tool_{i} from '../tools/{pth}.js';" for i, pth in enumerate(paths))
s = re.sub(r"\[\n require[\s\S]*?\]\.forEach", "[" + ", ".join(f"tool_{i}" for i in range(len(paths))) + "].forEach", s, count=1)
s = s.replace("import registry from '../core/ToolRegistry.js';", "import registry from '../core/ToolRegistry.js';\n" + imports, 1)
open(p, 'w').write(s)

shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db.shim.js'), f'{SRC}/config/db.js')

sub('routes/inventory.routes.js', 'validateGetStoreWideStock, ', '')
print('postpatch ok')
