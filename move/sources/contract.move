module contract::contract;

use std::string::String;

const ENoAccess: u64 = 0;

public struct Allowlist has key {
    id: object::UID,
    owner: address,
    blobs: vector<String>,
}

public struct Cap has key {
    id: object::UID,
    allowlist_id: object::ID,
}

public fun create_allowlist(ctx: &mut TxContext): Cap {
    let allowlist = Allowlist {
        id: object::new(ctx),
        owner: ctx.sender(),
        blobs: vector::empty<String>(),
    };
    let cap = Cap {
        id: object::new(ctx),
        allowlist_id: object::id(&allowlist),
    };
    transfer::share_object(allowlist);
    cap
}

entry fun create_allowlist_entry(ctx: &mut TxContext) {
    let cap = create_allowlist(ctx);
    transfer::transfer(cap, ctx.sender());
}



fun approve_internal(_id: vector<u8>, caller: address, allowlist: &Allowlist): bool {
    if (caller != allowlist.owner) {
        return false
    };
    return true
}

entry fun seal_approve(id: vector<u8>, allowlist: &Allowlist, ctx: &TxContext) {
    assert!(approve_internal(id, ctx.sender(), allowlist), ENoAccess);
}

fun verify_cap(cap: &Cap, allowlist: &Allowlist): bool {
    cap.allowlist_id == object::id(allowlist)
}

entry fun publish(allowlist: &mut Allowlist, cap: &Cap, blob_id: String) {
    assert!(verify_cap(cap, allowlist), ENoAccess);
    vector::push_back(&mut allowlist.blobs, blob_id);
}


