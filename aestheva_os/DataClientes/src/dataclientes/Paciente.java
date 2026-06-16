/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package dataclientes;

import java.util.ArrayList;


public class Paciente {
    int id;
    String nombre;
    String telefono;
    double peso;
    double estatura;
    int numeroVisitas;
    ArrayList<String> tratamientos;
    
    public Paciente(int id, String nombre, double peso, double estatura, String telefono){
        this.id = id;
        this.nombre = nombre;
        this.peso = peso;
        this.estatura = estatura;
        this.telefono = telefono;
        this.numeroVisitas = 0;
        this.tratamientos = new ArrayList<>(); 
    }
}
