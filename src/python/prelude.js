// The Python that wraps a learner's code. Runs the code, captures what it prints, turns errors into data,
// and gives it two helper objects: `panel` (her Mission Control panel) and `circuit` (her workshop board).
// Nothing here touches the page: calls are recorded as "actions" and returned for the page to apply.
//
// Inputs (set as Python globals before this runs): __code (her code), __ctx_json (see src/python/exec.js).

export const PRELUDE = `
import sys, io, json

def __run():
    ctx = json.loads(__ctx_json)
    actions = []
    out = io.StringIO()

    class PanelError(Exception):
        pass

    def _switch_part(name):
        sw = ctx["switches"]
        if name not in sw:
            usable = [n for n, s in sw.items() if s["part"] in ctx["installed"]]
            if usable:
                raise PanelError("There is no switch called '" + str(name) + "'. Your switches: " + ", ".join(usable))
            raise PanelError("Your panel is empty. Finish a mission to install your first part.")
        if sw[name]["part"] not in ctx["installed"]:
            raise PanelError("'" + name + "' is not installed yet. Finish the " + sw[name]["project"] + " mission to install it.")

    class _Panel:
        def on(self, name):
            _switch_part(name)
            actions.append({"fn": "on", "name": name})
        def off(self, name):
            _switch_part(name)
            actions.append({"fn": "off", "name": name})
        def dim(self, percent):
            if "dimmer" not in ctx["installed"]:
                raise PanelError("The dimmer is not installed yet. Finish the " + ctx["dimmerProject"] + " mission to install it.")
            if not isinstance(percent, (int, float)) or percent < 0 or percent > 100:
                raise PanelError("dim() needs a number from 0 to 100.")
            actions.append({"fn": "dim", "value": percent})

    def _reading(part, key, unit):
        r = ctx["readings"]
        if part not in r:
            have = ", ".join(sorted(r.keys())) or "nothing yet"
            raise PanelError("There is no part called '" + str(part) + "' on your workshop board. Parts: " + have)
        return r[part][key]

    class _Circuit:
        def current(self, part):
            return _reading(part, "current", "A")
        def voltage(self, part):
            return _reading(part, "voltage", "V")
        def power(self, part):
            return _reading(part, "power", "W")
        def parts(self):
            return sorted(ctx["readings"].keys())

    def _input(*args, **kwargs):
        raise PanelError("input() is not available here. Put the numbers straight into your code as variables.")

    ns = {"__name__": "__main__", "panel": _Panel(), "circuit": _Circuit(), "input": _input, "PanelError": PanelError}
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = out
    sys.stderr = out
    err = None
    try:
        exec(compile(__code, "<your code>", "exec"), ns)
    except SyntaxError as e:
        err = {"type": type(e).__name__, "message": e.msg or str(e), "line": e.lineno}
    except BaseException as e:
        line = None
        tb = e.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<your code>":
                line = tb.tb_lineno
            tb = tb.tb_next
        err = {"type": type(e).__name__, "message": str(e), "line": line}
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    text = out.getvalue()
    return json.dumps({"output": text[:5000], "truncated": len(text) > 5000, "error": err, "actions": actions})

__run()
`;
