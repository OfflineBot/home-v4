
# Backend

## Structure

The backend is split into 3 parts:
- `routes`: the full router
- `services`: the logic for the router
- `store`: the sql queries for the services

There are no plans on adding any more than the main 3 folders!
Only subfolders - each for one domain - are added!


Each domain has code for only its domain!

`store` does not know about `services`; `services` does not know about `routes`

## API

everything is listed under `/api/*`

to see what to use implement swagger later :)

