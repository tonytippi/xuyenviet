CREATE FUNCTION prevent_ai_gateway_model_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AI Gateway model catalog records cannot be deleted';
END;
$$;

CREATE TRIGGER prevent_ai_gateway_model_deletion
BEFORE DELETE ON ai_gateway_models
FOR EACH ROW
EXECUTE FUNCTION prevent_ai_gateway_model_deletion();
