
      create or replace view "dev"."main"."daily_item_history__dbt_int" as (
        select * from read_parquet('s3://osrs-parquet/marts/daily/daily_item_history.parquet', union_by_name=False)
        -- if relation is empty, filter by all columns having null values
        
      );
    