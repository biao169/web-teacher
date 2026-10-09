"""Pure maintenance visibility policy shared with page presentation."""
def allowed(p):
    return bool(p and p.get("is_system")==1 and not p.get("must_change_password") and p.get("permissions",{}).get("global_settings",{}).get("can_view"))
