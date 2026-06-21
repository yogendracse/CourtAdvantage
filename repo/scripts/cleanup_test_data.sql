-- Delete test data from dwh.tennis_courts
DELETE FROM dwh.tennis_courts 
WHERE park_name IN ('Test Park 1', 'Test Park 2');

-- Delete any associated availability data
DELETE FROM dwh.court_availability 
WHERE court_id IN (
    SELECT court_id 
    FROM dwh.tennis_courts 
    WHERE park_name IN ('Test Park 1', 'Test Park 2')
);

-- Delete from staging tables as well
DELETE FROM staging.tennis_courts 
WHERE park_name IN ('Test Park 1', 'Test Park 2');

DELETE FROM staging.court_availability 
WHERE court_id IN (
    SELECT court_id 
    FROM staging.tennis_courts 
    WHERE park_name IN ('Test Park 1', 'Test Park 2')
); 