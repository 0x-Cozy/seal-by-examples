1. publish

2. sui client call --package 0x29767478b6fbc156bc626dbb8310afbcb7b06e84b6ce2b9888d29951435d7e6d (replace with published package id if you want) --module contract --function create_allowlist_entry

3. Fill in env 

4. npx tsx encrypt.ts

5. npx tsx decrypt.ts


OR WITH WALRUS


4. npx tsx encrypt-and-upload.ts

5. Fill in env with BLOB_ID

6. npx tsx publish.ts

7. npx tsx download-and-decrypt.ts



sui client call --package 0x98fdf0aa35ba2c2dc7c0aa481a883afa4b944c7ab3b85564b6af40b8a82f5e5a --module contract --function create_allowlist_entry

note: you can use the existing package id in env.examples but you'd need o create a new allowlist (POLICY_OBJECT_ID) with the create_allowlist_entry as it would only approve if the caller is the allowlist owner (most basic example possible)