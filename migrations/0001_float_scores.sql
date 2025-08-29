ALTER TABLE "interviews" ALTER COLUMN "overall_score" TYPE real USING "overall_score"::real;
ALTER TABLE "responses" ALTER COLUMN "score" TYPE real USING "score"::real; 