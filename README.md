1. publish

2. sui client call --package 0x29767478b6fbc156bc626dbb8310afbcb7b06e84b6ce2b9888d29951435d7e6d (replace with published package id if you want) --module contract --function create_allowlist_entry

3. Fill in env 

npx tsx encrypt.ts

4. Fill in env with BLOB_ID

npx tsx publish.ts

npx tsx decrypt.ts

0xe8787bde918074d22cdba51660075743fd4c1629940ff1700c6fc03872bb312b



sui client call --package 0x98fdf0aa35ba2c2dc7c0aa481a883afa4b944c7ab3b85564b6af40b8a82f5e5a --module contract --function create_allowlist_entry