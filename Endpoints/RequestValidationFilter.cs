using System.ComponentModel.DataAnnotations;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Endpoints;

public sealed class RequestValidationFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var errors = new Dictionary<string, string[]>();
        foreach (var argument in context.Arguments)
        {
            if (argument?.GetType().Namespace != "ClinicaAurora.Dtos") continue;
            var results = new List<ValidationResult>();
            Validator.TryValidateObject(argument, new ValidationContext(argument), results, true);
            foreach (var group in results.SelectMany(result => result.MemberNames.DefaultIfEmpty("request")
                         .Select(name => (Name: name, Message: result.ErrorMessage ?? "Valore non valido."))).GroupBy(item => item.Name))
                errors[group.Key] = group.Select(item => item.Message).ToArray();
        }
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        try { return await next(context); }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 or 547 })
        {
            return Results.Conflict(new { message = "Il record è duplicato o è collegato ad altri dati. Verifica i valori inseriti." });
        }
        catch (SqlException exception) when (exception.Number is 2601 or 2627)
        {
            return Results.Conflict(new { message = "Questo orario non è più disponibile." });
        }
    }
}
